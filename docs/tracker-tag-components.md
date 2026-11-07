# Tracker Tag — Preliminary Electrical Components

Scope: the custom wildlife tracker tag for Task 2 (ConOps §5.2.4) and the ground
side needed to receive it. Each row names the part we plan to buy; the GNSS
antenna model is Simon's deep-dive. Prices are ballpark CAD.

## 0. What the ConOps requires

The UAV sticks a custom tag onto a deer decoy (velcro, hook side on our tag),
then a volunteer walks the decoy through the flight area for a 5-minute
trajectory (up to 5 m/s) while the UAV keeps ≥100 m horizontal offset. We submit
a CSV of `timestamp, latitude, longitude` **before the flight window ends**.

Hard constraints (ConOps §5.2.4):

| Constraint            | Value                                               | Consequence                                                                                   |
| --------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Mass                  | < 250 g                                             | Easy — expect ~60–90 g built                                                                  |
| Size                  | ≤ 8 cm in **any** axis                              | Kills some dev boards (T-Beam ≈ 10 cm)                                                        |
| Standalone            | no tether to UAS                                    | Needs own power + radio                                                                       |
| Attachment            | hook-and-loop = 10 pts, box drop = 0                | Flat velcro face, must survive a press-on                                                     |
| Accuracy              | ≤5 m of true path = 30 pts, 5–15 m = 50%, >15 m = 0 | GPS quality + antenna sky view is where the points are                                        |
| Timestamps            | gaps score 0 for the missing duration               | Link reliability matters as much as accuracy                                                  |
| CSV before window end | tracker stays on the animal (§ Task 2 safe landing) | **Live downlink is mandatory — onboard logging alone cannot produce the deliverable in time** |

No required update frequency; judges linearly interpolate between our points.
Target 1 Hz — cheap to do and tightens the reconstructed path.

## 1. Architecture

```
[tag on animal]                         [flight line]
GPS antenna
   │
GNSS receiver ─▶ MCU ─▶ LoRa 915 MHz ──radio──▶ LoRa receiver ─▶ GCS laptop
                  │                                                  │
               battery                                     dashboard map + CSV writer
```

Three cost tiers: **LOW** (Simon, separate doc), **MID** (Section 2 — the
baseline below), **HIGH** (Section 3 — targeted upgrades over mid).

## 2. Component categories — MID tier (baseline)

| #   | Item                            | What it does                                                                                                                                                                                                                  | Part we're buying                                                                              | CAD      |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| T1  | GNSS receiver                   | Position source; drives the 30-pt accuracy score                                                                                                                                                                               | Heltec Wireless Tracker V2 #1 (onboard UC6580)                                                   | 40       |
| T2  | GNSS antenna                    | Where the accuracy is won or lost. The ConOps puts the velcro on the deer's _side_, so the tag sits antenna-sideways — go full-size, angled skyward in the case. We have 200+ g of mass margin; spend it here first             | external active patch, 35–40 mm, u.FL/IPEX into board #1 — model is Simon's deep-dive            | 10–20    |
| T3  | LoRa radio module (tag side)    | Streams packets ≥1 km to flight line @ 915 MHz (licence-free ISM, avoids ConOps §4.7j licensed-band paperwork)                                                                                                                 | Heltec Wireless Tracker V2 #1 (onboard SX1262, 915 MHz SKU)                                                      | included |
| T4  | MCU                             | Reads NMEA, frames packets, drives radio. Firmware must buffer every fix in RAM (5 min @ 1 Hz ≈ 9 KB) and re-send unacknowledged points when the link recovers — turns a mid-run link outage from lost points into late points | Heltec Wireless Tracker V2 #1 (onboard ESP32-S3)                                                                 | included |
| T5  | Battery                         | Size for full flight window + staging with 2–3× headroom (a delayed window must not kill the tag) — mass margin makes the bigger cell free                                                                                     | 1000–1500 mAh 1S LiPo pouch cell                                                                 | 10–15    |
| T6  | Charger / regulator             | Charging + 3.3 V rail for T1–T4                                                                                                                                                                                                | Heltec Wireless Tracker V2 #1 (onboard charging + 3.3 V regulator)                                               | included |
| T7  | Velcro, hook side               | Attachment face per ConOps §5.2.4 (loop side is on the animal). Oversize the patch — more hook area = more reliable press-on = the 10 attachment pts                                                                           | industrial-strength adhesive hook tape                                                           | ~5       |
| T8  | Enclosure                       | 3D-printed case, Kaden/mech side. Rigid flat velcro face; angles T2 toward the sky internally; weather-sealed — ConOps §4.7i says the mission will NOT pause for rain, expect 10 kt winds gusting 20                           | printed in-house                                                                                 | ~5       |
| T9  | LoRa radio module (ground side) | Receives the downlink at the flight line; doubles as the firmware dev board until the tag is built                                                                                                                             | Heltec Wireless Tracker V2 #2, USB into the laptop                                               | 40       |
| T10 | Ground host                     | Bridges T9 to the dashboard + writes the CSV; must accept late/out-of-order points so backfill after a link outage closes gaps                                                                                                 | GCS laptop already running the dashboard                                                         | 0        |

**MID total: ~$110–125 CAD.** Buy the **915 MHz SKU**, not 868 (EU).

## 3. HIGH tier — targeted upgrades over mid

Same architecture, same boards, same firmware. Only rows that change are
listed; everything else is identical to mid — the mid tier is already the
right part for T1, T3, T4, T5, T6, T8, T10, and upgrading those would buy
nothing (e.g. a MAX-M10S receiver breakout was considered and rejected:
L1-only, a sidegrade to the UC6580 we already have).

| #     | Change vs mid                                                                                               | Why it earns points                                                                                                                                                            | CAD    |
| ----- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| T2    | u-blox ANN-MB5 dual-band L1+L5 active antenna + u.FL→SMA pigtail (replaces the generic L1 patch)             | The UC6580 on our board already supports L5 — the L5 band resists multipath, exactly the weakness of a sideways-mounted moving tag. The cheap patch wastes that capability. 49 × 46 × 16 mm, fits the case; trim the 3 m cable | 60–70  |
| T7    | VELCRO® Brand branded industrial hook tape (replaces generic)                                                | More consistent hook engagement for the press-on. **Do NOT "upgrade" to 3M Dual Lock** — it only mates with itself, not the loop side the comp puts on the animal = 0 pts      | ~10    |
| T9    | +1 third Heltec board as passive backup receiver at the flight line                                          | LoRa is broadcast — a second listener is free redundancy against a dead receiver/USB port, the failure that would cost all 30 tracking pts                                      | 40     |
| spare | Full spare tag kit (board + battery + printed case + velcro)                                                 | Comp-day insurance: a crashed or velcro-failed tag otherwise ends Task 2 tracking entirely                                                                                     | 55–60  |
| debug | microSD breakout on the tag                                                                                  | Power-loss-proof log for field tests and post-run analysis                                                                                                                     | ~5     |

**HIGH total: ~$280–310 CAD** — mid + ~$170, made up of:

- better GNSS antenna (ANN-MB5 over generic patch): **+$50**
- brand-name hook tape: **+$5**
- third board (backup receiver): **+$40**
- full spare tag kit: **+$55–60**
- microSD debug log: **+$5**

Of that, only the antenna (+$50) buys performance; the other ~$120 buys
redundancy. Compliance unchanged: heaviest build
(board + MB5 antenna with trimmed cable + battery + case) ≈ 180–200 g vs
250 g limit, antenna's 49 mm footprint fits the 8 cm box, still 915 MHz
licence-free, still genuine hook-and-loop. RTK (~$600+ for tag + base) stays
excluded — that's the "absurd" tier; it remains the contingency below.

Budget contingency: if the accuracy walk-test can't hold the 5 m threshold,
the fix is RTK GPS (~$300+, cm-level) — hold in reserve, don't buy up front.

Board swap note: the design isn't married to Heltec. Any board with the same
chips works — e.g. the LILYGO T-Echo (56 × 45 mm, nRF52840 + SX1262 + L76K) is
a legal tag swap, and since both brands use the SX1262 radio, mixed pairs
(LILYGO tag ↔ Heltec receiver) still talk to each other. Two costs of
swapping: the T-Echo's MCU is an nRF52840, not ESP32, so firmware doesn't port
over — decide the board before writing code — and its GPS antenna is sealed
inside its case, so our external-antenna accuracy upgrade (T2) needs the
Heltec's u.FL jack. The **LILYGO T-Beam** specifically does NOT work as the
tag: the board itself is 10–11.4 cm long against the ConOps 8 cm axis limit —
a hard geometric fail no case design fixes. It's fine as the ground
receiver (T9), where no size rule applies.
