# Task 1 traffic simulation

Simulates the other aircraft the competition server reports during Task 1 (CONOPS 5.2.3 §4): positions and altitudes at 1 Hz, each with a cylinder-shaped keep-out zone our drone must stay out of. Entering one costs −5 pts, for the first five entries (Table 5).

Run these in four terminals, starting in the project root in each terminal.

| Terminal | Command |
| --- | --- |
| 1. Simulator (our drone) | `cd Backend && python3 sim.py` |
| 2. Mock competition server | `cd Backend && python3 mock_comp_server.py` |
| 3. Backend | `cd Backend && AURORA_TRAFFIC_URL=ws://127.0.0.1:8765 python3 -m uvicorn mavlink:app --port 8000` |
| 4. Dashboard | `cd frontend && npm run dev` |

Traffic is off unless `AURORA_TRAFFIC_URL` is set; without it the backend and dashboard behave exactly as before. The URL must match the mock server's `--port`. The flag combines with the other modes, e.g. `AURORA_AEAC_PACKET_TEST=1 AURORA_TRAFFIC_URL=...`.

Open the Vite URL and stay on the flight dashboard. The traffic shows on the GPS map and in the **Airspace Traffic** panel.

## Scenarios

**Scripted** (default, same every run), laid out around `sim.py`'s 400 m circuit at 100 m. One lap takes about 140 s.

| Aircraft | Behaviour | What you see |
| --- | --- | --- |
| SIM-1 | Loiters slowly (3 m/s) in a 15 m circle on our circuit, at our altitude | Turns red and adds one keep-out entry every lap |
| SIM-2 | Flies north–south across the circuit, 40 m above us | Stays clear while passing overhead |
| SIM-3 | Orbits 45 m outside our circuit, the opposite way, at our altitude | Turns amber ("near") about twice a lap, never inside |

**Random**: `python3 mock_comp_server.py --scenario random`. Aircraft (`RND-1`, `RND-2`, …) start anywhere in a 1.2 km square around the centre at 10–25 m/s and 60–140 m, and bounce off its edges. A collision is not guaranteed. Add `--seed 42` (any number) to get the same traffic every run.

## Mock server flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `--scenario scripted\|random` | `scripted` | Which traffic to send |
| `--seed N` | none | Random only: same seed, same traffic |
| `--count N` | `3` | Random only: number of aircraft |
| `--keepout-radius M` | `30` | Zone radius, metres |
| `--keepout-height M` | `15` | Zone height above and below, metres |
| `--rate HZ` | `1.0` | Frames per second |
| `--center LAT,LON` | `49.2488,-122.9805` | Centre of the traffic (the sim's circuit) |
| `--host` / `--port` | `127.0.0.1` / `8765` | Where it listens |

The default zone (30 m, ±15 m) is our choice: the CONOPS gives no size.

## Dashboard

- **Banner**, most urgent first: traffic feed offline or stale → our own position unknown (check paused) → inside a zone (red) → near a zone (amber).
- **Map**: a circle per aircraft at its keep-out radius, cyan / amber / red by status, with an "ID · altitude" label. Grey and dashed when the feed is stale.
- **Airspace Traffic panel**: LIVE / STALE / OFFLINE badge, keep-out entries, penalised entries (out of 5), keep-out points lost (out of 25), last update, a table of each aircraft's horizontal and vertical distance and status, and the most recent entries.

## Rules as implemented

| Rule | Behaviour |
| --- | --- |
| Inside | Horizontal distance ≤ radius **and** vertical distance ≤ height |
| Near | Within radius + 30 m horizontally and height + 10 m vertically |
| Entry | Counted once each time our drone goes from outside to inside a zone, per aircraft. Staying inside doesn't add more. |
| Dropouts | An aircraft missing from a frame, or with an invalid entry, keeps its state. If it's gone more than 3 s and comes back while we're inside, that counts as a new entry. |
| Penalty | −5 per entry, first 5 only (25 max). These 25 pts are shared with the telemetry penalties, which this panel doesn't show. |
| Stale | No valid traffic frame for 3 s, or our own position older than 3 s, pauses the check |

## Stand-in message format

The mock server sends this once per second. The real server's format is still unknown; only `Backend/comp_server_client.py` and `Backend/traffic_monitor.py` would need to change.

```json
{"type": "traffic", "timestamp": 1795000000.0,
 "aircraft": [{"id": "SIM-1", "latitude": 49.2488, "longitude": -122.9750, "altitude_m": 100.0,
               "keepout_radius_m": 30.0, "keepout_height_m": 15.0}]}
```

Altitudes are metres above home (takeoff), the same reference as our drone's `relative_altitude`.

## Limitations

- Our drone is checked only when a frame arrives (1 Hz). At ~18 m/s a brief clip through the edge of a zone can fall between two samples.
- Display and alerts only: Aurora doesn't steer around traffic.
- Entry times are our computer's receive time, not the server's.
- The entry count lives in the backend's memory, counts the whole session (including on the ground) and resets when the backend restarts.
- If a server ever sent the same aircraft ID twice in one frame, only the first copy is used.

## What remains for competition

| Area | Work to complete or verify |
| --- | --- |
| Server connection | Transport, message format and authentication token from the aeac.mylonics.com documentation |
| Altitude reference | Whether other aircraft altitudes are AGL, MSL or above home, and convert ours to match |
| Keep-out zones | Real radial and vertical keepaway sizes, and whether they differ per aircraft |
| Upstream telemetry | Whether the same connection carries our 1 Hz AEAC telemetry packets to the server |
| Timing | Whether violations should use the server's clock |
| Tuning | Field-test the "near" buffer so warnings come early enough to react |
| Avoidance | Decide whether Aurora should suggest or command an avoiding manoeuvre |

## Tests

```bash
python3 -m unittest discover -s Backend -p 'test_*.py' -v   # from the project root
cd frontend && npm run test:traffic
```
