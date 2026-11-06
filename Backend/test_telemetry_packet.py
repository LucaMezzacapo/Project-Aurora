# run in backend: python3 test_telemetry_packet.py --live


import unittest
from pydantic import ValidationError
from telemetry_packet import TelemetryPacket


class TestTelemetryPacket(unittest.TestCase):
    def setUp(self):
        self.sample = {
            "uav_id": "aurora-01",
            "timestamp": 1810405350.2,
            "latitude": 49.2488,
            "longitude": -122.9805,
            "altitude_agl_m": 100.0,
            "horizontal_accuracy_m": 2.5,
            "vertical_accuracy_m": 4.0,
            "battery_percentage": 75.0,
            "flight_mode": "armed-automatic",
            "rc_link_status": 0.95,
            "telemetry_link_status": 0.9,
        }

    def test_complete_sample_json_round_trip(self):
        packet = TelemetryPacket(**self.sample)
        self.assertEqual(packet.model_dump(), self.sample)
        self.assertEqual(TelemetryPacket.model_validate_json(packet.model_dump_json()), packet)

    def test_every_field_required_and_cannot_be_unknown(self):
        for field in self.sample:
            with self.subTest(field=field, case="missing"):
                data = self.sample.copy()
                del data[field]
                with self.assertRaises(ValidationError):
                    TelemetryPacket(**data)
            with self.subTest(field=field, case="unknown"):
                with self.assertRaises(ValidationError):
                    TelemetryPacket(**(self.sample | {field: None}))

    def test_rejects_bad_ranges_and_types(self):
        bad_values = {
            "uav_id": ["", "   ", 123],
            "timestamp": [-1, "1810405350", True],
            "latitude": [-90.01, 90.01],
            "longitude": [-180.01, 180.01],
            "altitude_agl_m": [-1],
            "horizontal_accuracy_m": [-1],
            "vertical_accuracy_m": [-1],
            "battery_percentage": [-1, 100.01],
            "flight_mode": ["running", "GUIDED", "armed", ""],
            "rc_link_status": [-0.01, 1.01],
            "telemetry_link_status": [-0.01, 1.01],
        }
        for field, values in bad_values.items():
            for value in values:
                with self.subTest(field=field, value=value):
                    with self.assertRaises(ValidationError):
                        TelemetryPacket(**(self.sample | {field: value}))

    def test_all_numeric_fields_reject_nonfinite_strings_and_booleans(self):
        for field, value in self.sample.items():
            if not isinstance(value, (int, float)):
                continue
            for invalid in [float("nan"), float("inf"), -float("inf"), "0.5", True, False]:
                with self.subTest(field=field, invalid=invalid):
                    with self.assertRaises(ValidationError):
                        TelemetryPacket(**(self.sample | {field: invalid}))

    def test_valid_boundaries_and_modes(self):
        for mode in ["off", "idle", "link-lost", "failsafe", "armed-pilot", "armed-automatic"]:
            for lat, lon, battery, link in [(-90, -180, 0, 0), (90, 180, 100, 1)]:
                with self.subTest(mode=mode, latitude=lat):
                    TelemetryPacket(**(self.sample | {
                        "flight_mode": mode, "latitude": lat, "longitude": lon,
                        "battery_percentage": battery, "rc_link_status": link,
                        "telemetry_link_status": link, "altitude_agl_m": 0,
                        "horizontal_accuracy_m": 0, "vertical_accuracy_m": 0,
                    }))

    def test_rejects_dashboard_fields_and_mutation(self):
        with self.assertRaises(ValidationError):
            TelemetryPacket(**(self.sample | {"mission_status": "running"}))
        packet = TelemetryPacket(**self.sample)
        with self.assertRaises(ValidationError):
            packet.latitude = 120


async def check_live_packets(url, samples, warmup, expected_hz):
    import asyncio
    import json
    import time
    import websockets

    intervals = []
    previous_arrival = None
    previous_timestamp = None
    distinct = set()
    received = 0
    deadline = time.monotonic() + warmup

    async with websockets.connect(url, open_timeout=5) as ws:
        while received < samples:
            raw = await asyncio.wait_for(ws.recv(), timeout=5)
            arrival = time.monotonic()
            data = json.loads(raw)
            payload = data.get("aeac_packet")
            if payload is None:
                issues = data.get("aeac_packet_issues", [])
                if received or arrival >= deadline:
                    raise AssertionError(f"Packet unavailable: {issues}")
                print(f"Waiting for simulator data: {issues}")
                continue

            packet = TelemetryPacket.model_validate(payload)
            if data.get("aeac_packet_issues"):
                raise AssertionError(f"Valid packet has issues: {data['aeac_packet_issues']}")
            for field in TelemetryPacket.model_fields:
                if field not in ("uav_id", "timestamp"):
                    if field not in data or payload[field] != data[field]:
                        raise AssertionError(f"Packet differs from received snapshot: {field}")
            if previous_timestamp is not None and packet.timestamp <= previous_timestamp:
                raise AssertionError("Packet timestamp did not advance")
            if previous_arrival is not None:
                intervals.append(arrival - previous_arrival)
            previous_timestamp = packet.timestamp
            previous_arrival = arrival
            received += 1
            distinct.add((packet.horizontal_accuracy_m, packet.vertical_accuracy_m,
                          packet.rc_link_status, packet.telemetry_link_status))
            print(f"{received}/{samples}: VALID | lat={packet.latitude:.7f} | "
                  f"AGL={packet.altitude_agl_m:.2f}m | "
                  f"accuracy={packet.horizontal_accuracy_m:.2f}/{packet.vertical_accuracy_m:.2f}m | "
                  f"mode={packet.flight_mode} | RC={packet.rc_link_status:.3f} | "
                  f"telemetry={packet.telemetry_link_status:.3f}")

    target = 1.0 / expected_hz
    average = sum(intervals) / len(intervals)
    print(f"Intervals: min={min(intervals):.3f}s, mean={average:.3f}s, "
          f"max={max(intervals):.3f}s; observed={1 / average:.3f} Hz")
    print(f"Distinct accuracy/link value combinations: {len(distinct)}")
    # Local diagnostic tolerance, not certification of AEAC timing compliance.
    if any(abs(interval - target) > target * 0.2 for interval in intervals):
        raise AssertionError(f"Delivery interval outside +/-20% of {expected_hz:g} Hz target")
    print(f"PASS: {samples} complete packets validated against the model and snapshot; "
          "timestamps advanced and local delivery timing passed.")
    print("This does not verify sensor freshness or AEAC-server delivery.")


def main():
    import argparse
    import asyncio
    import sys

    if "--live" not in sys.argv:
        unittest.main()
        return

    parser = argparse.ArgumentParser(description="Check live local packet values and arrival timing.")
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--url", default="ws://127.0.0.1:8000/ws/telemetry")
    parser.add_argument("--samples", type=int, default=10)
    parser.add_argument("--warmup", type=float, default=10)
    parser.add_argument("--expected-hz", type=float, default=1)
    args = parser.parse_args()
    if args.samples < 2 or args.warmup < 0 or args.expected_hz <= 0:
        parser.error("samples must be >= 2, warmup >= 0, and expected-hz > 0")
    try:
        asyncio.run(check_live_packets(args.url, args.samples, args.warmup, args.expected_hz))
    except KeyboardInterrupt:
        raise SystemExit(130)
    except Exception as exc:
        print(f"FAIL: {type(exc).__name__}: {exc}", file=sys.stderr)
        print("Start sim.py and the backend with AURORA_AEAC_PACKET_TEST=1. "
              "Use AURORA_SIM_INVALID=0 for the valid-packet test.", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()

