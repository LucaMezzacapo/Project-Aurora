# Task 2 packet practice

Run these in three terminals, starting in the project root in each terminal.

| Terminal | Command |
| --- | --- |
| 1. Simulator | `cd Backend && AURORA_TRACKER_PRACTICE=1 python3 sim.py` |
| 2. Backend | `cd Backend && AURORA_TRACKER_PRACTICE=1 python3 -m uvicorn mavlink:app --port 8000` |
| 3. Dashboard | `cd frontend && npm run dev` |

Open the Vite URL and select **Wildlife Tracker**. Click **Start Task 2 Demo** above Mission Workflow. The aircraft flies from its launch point to the animal at the search centre. On arrival the simulator holds position for a 30-second drop. The workflow shows the countdown and confirms deployment. The tag moves along a walking path and the aircraft departs, then orbits. The simulator sends two MAVLink GPS messages per sample, with a shared source timestamp. GPS_RAW_INT carries the aircraft position. Only this opt-in local scenario uses GPS2_RAW for the tag.

Watch **Mission Workflow**. The first synchronized pair at least 100 m apart starts recording. The backend keeps tag fixes until five minutes elapse or the ten-minute practice window ends, whichever comes first. It continues checking separation until the window ends. Refreshing the browser restores the backend recording. Missing packets leave gaps. The same Wildlife Tracker dashboard selects practice automatically from the backend frame. Demo-only controls disappear. The map marker follows the newest tag fix, while the CSV preview and trail use the recorded window. A dropped connection marks positions stale. Fields without packet measurements display a dash.

Choose **Export Tracking CSV** when the tracking window ends, or download a partial CSV during the run. Rows contain source UTC time to milliseconds, latitude, and longitude in chronological order. This downloads a local file. Restart both simulator and backend for a new run. Download before stopping the backend because its recording is in memory.

## What the rehearsal demonstrates

This is the tracking portion of Task 2. The route in `sim.py` is scripted. The first two stages rehearse a scripted approach and timed deployment. The aircraft GPS determines when the offset is reached together with the tag GPS. Only tag fixes enter the CSV. A partial download is available during the window. After it closes, export the final file and optionally mark the practice handoff in the dashboard. The handoff is a local operator acknowledgement.

## What remains for competition

| Area | Work to complete or verify |
| --- | --- |
| Tag and deployment | Verify the physical tag weighs under 250 g, fits inside an 8 cm ball at all times, operates at any carrying angle, and is independent of the aircraft. Exercise target identification and actual attachment in the field. |
| Position sources and recording | Connect the real tag receiver and aircraft GPS. Preserve each tag fix’s acquisition time through delayed delivery. Add durable storage, recovery and chronological import of buffered fixes. The rehearsal pairs identical timestamps from two simulator messages. Independent receivers need a validated time-alignment method. |
| Flight window and offset | Use the official window times. Verify the aircraft reaches 100 m from the tag and maintains at least that distance through the rest of the window, including any battery swap. The dashboard observes separation at sample times. Its counter cannot establish what happened between samples. |
| Accuracy and delivery | Compare the recorded path against an independently measured reference. The scoring bands are full credit within 5 m, half credit in the 5–15 m band, and zero beyond 15 m. Uncovered time earns zero. Check coverage from the threshold crossing through five minutes or window end, and deliver the chronological three-column CSV before the window closes. Tag data may arrive after acquisition. |
| Sample and autonomy | Rehearse collecting the sample, delivering it to the flight-line landing pad and leaving it there until window end. Record when the aircraft first touches the sample and when it drops it on the pad to establish the scored autonomy interval. |

Task 1 is a separate herd survey. It needs armed aircraft telemetry delivered to the competition server, the 300-second continuity and timing checks, other-aircraft keep-out monitoring, a non-armed report before disconnect, and the labelled deer survey text report. The aircraft telemetry panel alone does not verify these requirements.
