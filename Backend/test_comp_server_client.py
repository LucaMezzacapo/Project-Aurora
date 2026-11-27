import json
import unittest

from comp_server_client import handle_raw
from test_traffic_monitor import ORIGIN, aircraft, frame
from traffic_monitor import TrafficMonitor


def own_inside():
    return ORIGIN[0], ORIGIN[1], 100.0  # right on top of SIM-1 in test_traffic_monitor.aircraft()


class TestHandleRaw(unittest.TestCase):
    """One bad message must never raise (and so never drop the feed connection)."""

    def setUp(self):
        self.monitor = TrafficMonitor()
        self.errors = []

    def handle(self, raw):
        return handle_raw(raw, self.monitor, own_inside, now=1000.0, on_error=self.errors.append)

    def test_good_frame_is_stored_and_evaluated(self):
        self.assertTrue(self.handle(json.dumps(frame(aircraft()))))
        self.assertEqual(self.monitor.aircraft[0]["status"], "inside")
        self.assertEqual(self.monitor.violations, 1)
        self.assertEqual(self.errors, [])

    def test_bad_messages_are_skipped_without_raising(self):
        bad = [
            "not json",
            "",
            "[" * 200000 + "]" * 200000,  # RecursionError inside json.loads
            json.dumps({"type": "other"}),
            json.dumps([1, 2, 3]),
            b"\x00\xff\xfe",
        ]
        for raw in bad:
            self.assertFalse(self.handle(raw), repr(raw)[:40])
        self.assertTrue(any(isinstance(e, RecursionError) for e in self.errors))

    def test_huge_integer_timestamp_is_ignored_not_fatal(self):
        raw = '{"type":"traffic","timestamp":1' + "0" * 400 + ',"aircraft":[]}'
        self.assertTrue(self.handle(raw))  # still a usable (empty) frame ...
        self.assertIsNone(self.monitor.server_timestamp)  # ... with the bad timestamp dropped
        self.assertEqual(self.errors, [])

    def test_good_frame_after_bad_ones_still_works(self):
        self.handle("[" * 200000)
        self.handle("garbage")
        self.assertTrue(self.handle(json.dumps(frame(aircraft()))))
        self.assertEqual(self.monitor.violations, 1)

    def test_error_in_position_callback_is_contained(self):
        def broken():
            raise RuntimeError("position source failed")
        self.assertFalse(handle_raw(json.dumps(frame(aircraft())), self.monitor, broken,
                                    now=1000.0, on_error=self.errors.append))
        self.assertIsInstance(self.errors[-1], RuntimeError)


if __name__ == "__main__":
    unittest.main()
