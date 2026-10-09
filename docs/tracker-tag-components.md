# Tracker Tag — Preliminary Electrical Components

Scope: the custom wildlife tracker tag for Task 2 (ConOps §5.2.4) and the ground
side needed to receive it. Categories first, example models second — per the
Oct 2 meeting, exact model selection is Simon's deep-dive. Prices are ballpark
CAD.

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

## 2. Component categories (the meeting deliverable)

| #   | Item                               | What it does                                                                                                                                                                                                | Example                                                                                          | CAD   |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----- |
| T1  | GNSS receiver                      | Position source; drives the 30-pt accuracy score                                                                                                                                                            | u-blox MAX-M10S (~2 m CEP, 25 mW) or ATGM336H (~2.5 m CEP, ~$10)                                 | 10–35 |
| T2  | GNSS antenna                       | Where the accuracy is won or lost. The ConOps puts the velcro on the deer's _side_, so the tag sits antenna-sideways — go full-size (35–40 mm patch on a proper ground plane, or active w/ LNA), angled skyward in the case. We have 200+ g of mass margin; spend it here first                                                                                                                 | 35–40 mm patch or active antenna w/ LNA — don't settle for the tiny bundled one | 5–20  |
| T3  | LoRa radio module (tag side)       | Streams packets ≥1 km to flight line                                                                                                                                                                        | SX1262/SX1276 breakout @ 915 MHz (licence-free ISM, avoids ConOps §4.7j licensed-band paperwork) | 10–25 |
| T4  | MCU                                | Reads NMEA, frames packets, drives radio. Firmware must buffer every fix in RAM (5 min @ 1 Hz ≈ 9 KB) and re-send unacknowledged points when the link recovers — turns a mid-run link outage from lost points into late points                                                                                                                                                                    | ESP32-S3 / RP2040                                                                                | 8–15  |
| T5  | Battery                            | Size for full flight window + staging with 2–3× headroom (a delayed window must not kill the tag) — mass margin makes the bigger cell free                                                                 | 1000–1500 mAh 1S LiPo                                                                            | 10–15 |
| T6  | Charger / regulator                | Charging + 3.3 V rail for T1–T4                                                                                                                                                                             | TP4056 board, or onboard charging if the dev board has it                                        | 2–5   |
| T7  | Velcro, hook side                  | Attachment face per ConOps §5.2.4 (loop side is on the animal). Oversize the patch — more hook area = more reliable press-on = the 10 attachment pts                                                       | industrial-strength adhesive hook tape                                                           | ~5    |
| T8  | Enclosure                          | 3D-printed case, Kaden/mech side. Rigid flat velcro face; angles T2 toward the sky internally; weather-sealed — ConOps §4.7i says the mission will NOT pause for rain, expect 10 kt winds gusting 20       | —                                                                                                | ~5    |
| T9  | LoRa radio module (ground side)    | Receives the downlink at the flight line                                                                                                                                                                    | matching LoRa board on USB serial                                                                | 15–45 |
| T10 | Ground host                        | Bridges T9 to the dashboard + writes the CSV; must accept late/out-of-order points so backfill after a link outage closes gaps                                                                              | GCS laptop already running the dashboard — T9 plugs in over USB                                  | 0     |

Budget contingency: if the accuracy walk-test can't hold the 5 m threshold,
the fix is RTK GPS (~$300+, cm-level) — hold in reserve, don't buy up front.
