# Wildlife Tracker UI

The original tracker demo translates the supplied Stitch HTML into React components using Aurora's existing CSS tokens, React Leaflet and Lucide icons. The demo works without the backend; the separate AEAC aircraft panel connects to the backend described below.

## Preview

From `frontend`, install the existing dependencies with `npm ci`, then run `npm run dev`. The Wildlife Tracker opens by default. Use the workspace navigation to open the existing Flight Dashboard.

The tracker starts in a populated **demo session**, 102 seconds into its five-minute trajectory. Measurements in the demo map and animal-tracking workflow are simulated and explicitly labelled. The separate AEAC panel displays backend aircraft telemetry. Neither view makes aircraft commands or tracker API calls. The original Flight Dashboard still uses its existing backend when selected.

- Use **Preview state** to simulate safe tracking, a separation warning, tag-link loss, UAV-link loss or both links lost. A failed link becomes stale after three demo seconds. Restore Safe tracking to resume fresh fixes; outages remain visible in the recording gap count and disconnected trail segments.
- **Pause demo** freezes the demo clock and telemetry. It is not a mission pause command.
- **New session** clears the in-memory demo after confirmation. Verify the target, confirm one hook-and-loop tag, then start the trajectory when fresh positions show at least 100 m horizontal separation.
- Map controls pan/zoom, fit the trail and centre the UAV. The offline tactical grid is the default; optional OpenStreetMap street tiles require internet. The boundary and search centre are illustrative.
- CSV export works before or after trajectory completion. It downloads only `timestamp,latitude,longitude`, with valid, unique chronological ISO 8601 UTC timestamps and decimal degrees. Event logs can be downloaded separately.
- Mark as submitted records an operator action in the demo; it does not upload anything. Demo sessions are memory-only and reset on page refresh. Export before refreshing if needed.

## CONOPS design corrections

The design uses **≥100 m horizontal separation**, calls the 25 m circle **Target Search Area**, avoids unverified ground-truth accuracy/score claims and does not imply a radar rangefinder. Separation becomes unknown when either position is stale. The trajectory ends after five minutes or at flight-window end, whichever is earlier; offset monitoring continues afterwards. Export and submission are distinct.

## Later backend integration

`src/app/tracker/tracker-model.ts` is the isolated demo model; `wildlife-tracker.tsx` renders it; `tracker-map.tsx` handles map presentation. Replace the demo reducer/interval with a data hook using the same normalized state. The two dashboards must keep tag and aircraft position/freshness separate.

Required inputs: tag ID, tag fix timestamp and coordinates, UAV position and its own position timestamp, flight-window deadline, attachment/target confirmations, trajectory start, recording history and submission state. Optional inputs: tag GNSS accuracy in metres, fix type, satellites, HDOP, battery voltage/percentage, RSSI/SNR and measured update rate. Today these optional display values are explicit demo examples; wire them individually or render unavailable values as an em dash.

Persist recording and mission timestamps in the backend before operational use. Preserve fix-time provenance, handle late/out-of-order fixes, and measure gaps against the chosen receiver update rate. Browser refresh, connection loss and multiple clients must not reset or duplicate a real trajectory. The demo's 3-second freshness threshold and 1 Hz sampling are UI preview choices, not competition requirements.

## Checks

- `npm run build`
- `npm run test:tracker` (Node 22.18+ or Node 24 for built-in TypeScript stripping)

Tests cover missing positions, recovery/gaps, trajectory start prerequisites, five-minute and flight-window cutoffs, CSV validation/order/columns, pause behaviour and export/submission separation.


## AEAC aircraft telemetry panel

The Wildlife Tracker tab now subscribes to the existing backend WebSocket at
`ws://127.0.0.1:8000/ws/telemetry`. Set `VITE_TELEMETRY_WS_URL` before starting
Vite to use another endpoint. The aircraft panel is independent of the existing
demo reducer, map, animal history, separation calculation, and CSV export.
Pausing the demo does not pause backend telemetry.

The panel displays all required packet fields, backend validation issues,
connection state, message age, and measured delivery rate over up to ten arrivals.
Absent/invalid values display as unavailable; a packet is marked valid only when
complete, without backend errors, and structurally valid in the browser. A stale
or disconnected stream retains labelled historical readings and is not current.
Transport age is not proof of per-field sensor freshness. The new
`aeac_simulation` snapshot metadata identifies backend synthetic packet test mode;
when false the panel does not assume the MAVLink source is a physical aircraft.
It does not connect to or certify delivery to the competition server.

From `Backend`, start the simulator and backend in separate terminals:

```bash
AURORA_AEAC_PACKET_TEST=1 AURORA_SIM_INVALID=0 python3 sim.py
AURORA_AEAC_PACKET_TEST=1 python3 -m uvicorn mavlink:app --port 8000
```

Start the frontend with `npm run dev`. To inspect rejection behaviour, restart
the simulator and backend with `AURORA_SIM_INVALID=1` on the simulator command;
the panel should show an invalid RC-link diagnostic and no valid packet badge.
Stop the backend to inspect disconnect/reconnection behaviour. No source changes
are needed to switch these test modes. Keep animal-tag measurements separate:
this panel cannot replace the future tag receiver/session backend.

Checks: `npm run test:aeac`, `npm run test:tracker`, `npm run build`.
