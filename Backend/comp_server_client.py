"""Receive other-aircraft traffic from the competition server (for now, mock_comp_server.py).

Enabled only when AURORA_TRAFFIC_URL is set, e.g. ws://127.0.0.1:8765 for the local mock.

TO CONFIRM against the real aeac.mylonics.com documentation before competition:
  - transport and message format (this client expects the stand-in JSON frames from
    mock_comp_server.py: {"type": "traffic", "timestamp", "aircraft": [...]})
  - altitude reference of other aircraft (we compare against our height above home)
  - keep-out zone sizes (radial and vertical keepaway) and whether they vary per aircraft
  - connection token / authentication
  - whether the same connection also carries our 1 Hz AEAC telemetry upstream
  - whether violation times should use the server's clock rather than ours
"""
import asyncio
import json
import time

import websockets

RECONNECT_DELAY_S = 2.0
OPEN_TIMEOUT_S = 5.0


def handle_raw(raw, monitor, get_own_position, now=None, on_error=None):
    """Process one message from the feed. Never raises, so one bad message can't drop the connection.

    Returns True if it was a valid traffic frame (stored and checked against our position).
    Messages that aren't usable frames return False; if processing failed with an exception
    (e.g. unparseable JSON, absurdly deep nesting), on_error(exc) is called first.
    """
    try:
        frame = json.loads(raw)
        if not monitor.update(frame, time.time() if now is None else now):
            return False
        monitor.evaluate(*get_own_position())
        return True
    except Exception as exc:  # RecursionError, ValueError, ... : skip this frame, keep the feed
        if on_error is not None:
            on_error(exc)
        return False


async def run_traffic_client(url, monitor, get_own_position):
    """Keep a connection to the traffic feed open forever, reconnecting after any failure.

    monitor:          TrafficMonitor that stores frames and checks our drone against them
    get_own_position: callable returning (latitude, longitude, altitude above home) of our drone,
                      or (None, None, None) when our position is unknown or stale
    """
    reported_down = False
    while True:
        bad_frame_reported = False

        def report_bad_frame(exc):
            nonlocal bad_frame_reported
            if not bad_frame_reported:  # once per connection, not once per bad frame
                print(f"Ignoring bad traffic frame ({type(exc).__name__})")
                bad_frame_reported = True

        try:
            async with websockets.connect(url, open_timeout=OPEN_TIMEOUT_S) as ws:
                monitor.set_connected(True)
                reported_down = False
                print(f"Traffic feed connected: {url}")
                async for raw in ws:
                    handle_raw(raw, monitor, get_own_position, on_error=report_bad_frame)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # refused, dropped, timed out: all handled the same way
            if not reported_down:
                print(f"Traffic feed unavailable ({type(exc).__name__}); retrying every {RECONNECT_DELAY_S:.0f} s")
                reported_down = True
        finally:
            monitor.set_connected(False)
        await asyncio.sleep(RECONNECT_DELAY_S)
