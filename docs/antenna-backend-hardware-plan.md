# Antenna Backend-to-Hardware Plan

Goal: define the full pipeline that turns DroneSim telemetry into physical antenna
movement, so the ground-station antenna automatically points at the aircraft. Covers
the backend software pipeline, the hardware movement plan, the interface between
them, and safety behaviour. Written before any physical hardware is connected —
everything is provable against a mock driver first.

## 0. State on `main` (reconciliation with the antenna panel commit)

Commit `86f3d65 feat: add antenna tracking panel` shipped the top of this pipeline.
This plan is reconciled to it:

- **Merged and adopted:** `Backend/mavlink.py` holds an `antenna_state` dict
  (`ground_station`, `tracking_status`) under `antenna_lock`, exposes
  `/antenna/status`, `/antenna/ground-station`, `/antenna/enable`, `/antenna/pause`,
  `/antenna/disable`, and pushes both fields on the existing `/ws/telemetry`
  snapshot. `frontend/src/app/components/antenna-panel.tsx` renders the
  `active | paused | disabled` badge and GCS input. This plan uses those names and
  that runtime-saved GCS position (not a config file) as given.
- **Open gap — azimuth is frontend-only:** `calculateAzimuth()` lives in
  `frontend/src/app/geo.ts` (great-circle bearing, 0–360°). The controller and
  serial driver run in the backend and cannot consume a value computed in the
  browser, so a **backend** azimuth source is still required. Elevation is not implemented anywhere yet.
- **Held from the plan:** `/antenna/disable` is a soft off-flag and does **not**
  send a hardware STOP. Emergency-stop stays a separate path (see the backend
  pipeline and safety sections below).

## 1. Pipeline overview

```
DroneSim telemetry ──MAVLink/TCP──▶ mavlink.py reader (exists)
                                        │ lat/lon/alt
                                        ▼
                       Backend azimuth/elevation calc (TODO — port geo.ts
                       calculateAzimuth into mavlink.py; add elevation)
                                        │ target az/el, ≥1–2° deadband
                                        ▼
                       Antenna controller (new backend module)
                        - clamps to limits, rate-limits slew
                        - reads/writes antenna_state.tracking_status (exists)
                        - driver interface: Mock ◀─▶ Serial
                                        │ text commands over USB serial
                                        ▼
                       ESP32 firmware ──hardware PWM──▶ pan + tilt servos
```

The drone-side parts (AET H743 flight controller, dual-band Gemini ELRS receiver,
BN220 GPS, 30 A/40 A ESCs) stay on the aircraft and feed this pipeline only through
telemetry. All hardware in this plan is ground-station side.

## 2. Backend software pipeline

New backend module (future `Backend/antenna.py`), sitting behind the `/antenna/*`
endpoints already in `mavlink.py` and consuming target angles from the backend
azimuth calc:

- **Input:** target azimuth 0–359.9° (and elevation 0–90° once available). Azimuth
  must be computed backend-side — port `geo.ts`'s `calculateAzimuth()` into
  `mavlink.py` against `telemetryInfo` lat/lon and the saved `ground_station`.
- **Processing:** clamp to soft limits, enforce max slew rate, drop commands inside
  the 1–2° deadband (the calc already deadbands; the controller enforces it again as
  a guard).
- **State machine:** reuse the existing `antenna_state["tracking_status"]`
  (`active | paused | disabled`) from `mavlink.py`. Here `disabled` is the merged
  meaning — off / no GCS saved / user-disabled. A link **fault** (acks stop, see the
  MCU command interface section) is a separate signal, surfaced as e.g. a `link`
  field alongside `tracking_status`, not by overloading `disabled`.
- **Driver interface:** one small interface (`move(az, el)`, `stop()`, `status()`)
  with two implementations:
  - `MockDriver` — logs every command and exposes the latest commanded angles on
    the existing `/ws/telemetry` snapshot, so the dashboard and tests run without
    hardware.
  - `SerialDriver` — speaks the serial protocol below over USB serial.
- **HTTP endpoints:** existing `/antenna/status`, `/antenna/ground-station`,
  `/antenna/enable`, `/antenna/pause`, `/antenna/disable` (already in `mavlink.py`),
  plus new `/antenna/emergency-stop` — same style as the mission endpoints. Note
  `disable` is a soft state flag; `emergency-stop` is the one that sends hardware
  `STOP` (see the safety section).

## 3. Backend ⇄ MCU command interface

Newline-delimited text over USB serial at 115200 baud — human-readable so any
serial monitor can debug it.

| Command                       | Direction     | Meaning                                     |
| ----------------------------- | ------------- | ------------------------------------------- |
| `MOVE <az 0-359.9> <el 0-90>` | backend → MCU | absolute target angles in degrees           |
| `STOP`                        | backend → MCU | hold position, ignore `MOVE` until `RESUME` |
| `RESUME`                      | backend → MCU | accept `MOVE` commands again                |
| `HOME`                        | backend → MCU | return to the 0/0 reference position        |
| `PING`                        | backend → MCU | link check, MCU replies `PONG`              |
| `OK` / `ERR <reason>`         | MCU → backend | ack for every command received              |

Rules:

- Every command is acked. Three consecutive missing/`ERR` acks → backend flags a
  link fault (separate from `tracking_status`, per the backend pipeline section) and
  surfaces it on the dashboard.
- The MCU clamps and validates independently of the backend — malformed or
  out-of-range commands get `ERR` and are ignored.
- Elevation is part of the protocol from day one so pan-only and pan-tilt builds
  speak the same interface.

## 4. Hardware plan (ground-station side)

| Part         | Choice                                       | Why                                                    |
| ------------ | -------------------------------------------- | ------------------------------------------------------ |
| MCU          | ESP32 dev board (or Pi Pico)                 | USB serial + hardware PWM, ~$8                         |
| Pan servo    | Sail-winch servo (HS-785HB class)            | multi-turn position control → 360° azimuth             |
| Tilt servo   | DS3218 / MG996R metal gear                   | 0–90° elevation, handles antenna + coax weight         |
| Servo power  | 5–6 V 3 A UBEC, common ground with MCU       | servos never powered from USB                          |
| Mount        | Off-the-shelf or 3D-printed pan-tilt bracket | v1 prototype                                           |
| GCS position | Saved at runtime via `/antenna/ground-station` (exists) | a second BN220 at the GCS is an optional later upgrade |

Wiring: laptop —USB— ESP32; ESP32 PWM pins → pan/tilt servo signal wires; UBEC →
servo power rails; all grounds common. Physical servo-power switch inline as the
hardware e-stop backstop.

## 5. Movement limits, safety rules, timeouts, e-stop

- **Soft limits, enforced twice:** backend clamps before sending; firmware clamps
  again. Azimuth limited to the pan mechanism's real travel; elevation 0–90°.
- **Max slew rate:** ~60°/s enforced in firmware — protects gears, prevents whip.
- **Deadband:** commands within 1–2° of the current target are dropped so the mount
  doesn't chatter.
- **Watchdog:** if the MCU receives no valid command for 5 s it holds position and
  blinks an error LED. The backend independently flags a link fault when acks stop —
  distinct from the user-facing `disabled` state.
- **Emergency stop:** `/antenna/emergency-stop` (new — not the same as
  `/antenna/disable`) sends `STOP`; the inline power switch is the hardware
  backstop.
- **Aircraft too close to GCS:** azimuth becomes unstable near overhead passes —
  the backend azimuth calc holds the last stable heading and the controller passes
  that through unchanged.

## 6. Mock-first rollout

1. **Mock driver only** — backend logs commands and streams state to the dashboard;
   proves the whole software pipeline against DroneSim with zero hardware.
2. **ESP32 on the bench, no servos** — firmware echoes acks; proves the serial
   protocol and watchdog.
3. **Servos on bench power** — proves motion, limits, and slew clamping.
4. **Assembled mount with antenna** — proves torque and wind load; tune slew rate.

## 7. Testing

- Unit tests for clamping, deadband, slew-rate limiting, and state transitions,
  all run against `MockDriver`.
- Serial protocol loopback test (backend talks to a fake port that echoes the MCU's
  responses).
- Written bench checklist for hardware steps 2–4 of the rollout, including stall
  current measurement before first full assembly.
