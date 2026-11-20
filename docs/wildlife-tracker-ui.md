# Wildlife Tracker UI

This frontend-only implementation translates the supplied Stitch HTML into React components using Aurora's existing CSS tokens, React Leaflet and Lucide icons. No backend files or manager branch are required.

## Preview

From `frontend`, install the existing dependencies with `npm ci`, then run `npm run dev`. The Wildlife Tracker opens by default. Use the workspace navigation to open the existing Flight Dashboard.

The tracker starts in a populated **demo session**, 102 seconds into its five-minute trajectory. All tag and UAV measurements are simulated and explicitly labelled. It makes no aircraft commands or tracker API calls. The original Flight Dashboard still uses its existing backend when selected.

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
