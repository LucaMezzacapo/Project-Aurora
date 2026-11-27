import json
import unittest

from sim import offset_to_latlon
from traffic_monitor import (MAX_PENALISED_VIOLATIONS, OWN_POSITION_STALE_S, PENALTY_PER_VIOLATION,
                             STALE_AFTER_S, TrafficMonitor, fresh_position, parse_aircraft)

ORIGIN = (49.2488, -122.9805)


def aircraft(ident="SIM-1", north=0.0, east=0.0, alt=100.0, radius=30.0, height=15.0):
    lat, lon = offset_to_latlon(*ORIGIN, north, east)
    return {"id": ident, "latitude": lat, "longitude": lon, "altitude_m": alt,
            "keepout_radius_m": radius, "keepout_height_m": height}


def frame(*entries, timestamp=1000.0):
    return {"type": "traffic", "timestamp": timestamp, "aircraft": list(entries)}


def status_at(monitor, north=0.0, east=0.0, alt=100.0):
    monitor.evaluate(*offset_to_latlon(*ORIGIN, north, east), alt)
    return {ac["id"]: ac["status"] for ac in monitor.aircraft}


class TestClassification(unittest.TestCase):
    def setUp(self):
        self.m = TrafficMonitor()
        self.m.update(frame(aircraft()), received_at=1000.0)

    def test_inside_near_clear_horizontally(self):
        self.assertEqual(status_at(self.m, east=10)["SIM-1"], "inside")
        self.assertEqual(status_at(self.m, east=45)["SIM-1"], "near")   # 30 m zone + 30 m buffer
        self.assertEqual(status_at(self.m, east=80)["SIM-1"], "clear")

    def test_vertical_separation_alone_keeps_clear(self):
        # Directly underneath the aircraft but 40 m lower: zone is 15 m, near buffer 10 m.
        self.assertEqual(status_at(self.m, alt=60)["SIM-1"], "clear")
        self.assertEqual(status_at(self.m, alt=80)["SIM-1"], "near")
        self.assertEqual(status_at(self.m, alt=90)["SIM-1"], "inside")

    def test_reports_distances(self):
        status_at(self.m, east=20, alt=95)
        ac = self.m.aircraft[0]
        self.assertAlmostEqual(ac["horizontal_m"], 20, delta=0.5)
        self.assertAlmostEqual(ac["vertical_m"], 5)

    def test_unknown_own_position(self):
        self.m.evaluate(None, None, None)
        self.assertEqual(self.m.aircraft[0]["status"], "unknown")
        self.m.evaluate(*ORIGIN, float("nan"))
        self.assertEqual(self.m.aircraft[0]["status"], "unknown")
        self.assertEqual(self.m.violations, 0)


class TestViolations(unittest.TestCase):
    def test_counts_once_per_entry_not_per_frame(self):
        m = TrafficMonitor()
        for t in range(5):  # five frames inside the zone
            m.update(frame(aircraft()), received_at=1000.0 + t)
            status_at(m, east=5)
        self.assertEqual(m.violations, 1)
        m.update(frame(aircraft()), received_at=1006.0)
        status_at(m, east=200)  # leave
        m.update(frame(aircraft()), received_at=1007.0)
        status_at(m, east=5)    # re-enter
        self.assertEqual(m.violations, 2)
        self.assertEqual([e["timestamp"] for e in m.log], [1000.0, 1007.0])

    def test_penalty_capped_at_five_occurrences(self):
        m = TrafficMonitor()
        for i in range(7):
            m.update(frame(aircraft()), received_at=1000.0 + 2 * i)
            status_at(m, east=5)
            m.update(frame(aircraft()), received_at=1001.0 + 2 * i)
            status_at(m, east=300)
        snap = m.snapshot(now=1014.0)
        self.assertEqual(snap["violations"], 7)
        self.assertEqual(snap["penalised_violations"], MAX_PENALISED_VIOLATIONS)
        self.assertEqual(snap["points_lost"], MAX_PENALISED_VIOLATIONS * PENALTY_PER_VIOLATION)
        self.assertEqual(snap["max_points_lost"], 25)

    def test_each_aircraft_counts_separately(self):
        m = TrafficMonitor()
        m.update(frame(aircraft("A"), aircraft("B", east=20)), received_at=1000.0)
        status_at(m, east=10)  # inside both zones
        self.assertEqual(m.violations, 2)
        self.assertEqual(sorted(e["id"] for e in m.log), ["A", "B"])


class TestDropouts(unittest.TestCase):
    """A missing or invalid entry is not evidence that we left a zone (overseer finding A1)."""

    def run_frames(self, frames):
        # frames: [(received_at, aircraft entries, own east offset or None for unknown position)]
        m = TrafficMonitor()
        for received_at, entries, east in frames:
            m.update(frame(*entries), received_at=received_at)
            if east is None:
                m.evaluate(None, None, None)
            else:
                status_at(m, east=east)
        return m

    def test_aircraft_missing_one_frame_while_inside_is_not_a_new_entry(self):
        m = self.run_frames([(1000, [aircraft()], 5), (1001, [], 5), (1002, [aircraft()], 5)])
        self.assertEqual(m.violations, 1)

    def test_invalid_entry_one_frame_while_inside_is_not_a_new_entry(self):
        nan_entry = {**aircraft(), "altitude_m": float("nan")}
        m = self.run_frames([(1000, [aircraft()], 5), (1001, [nan_entry], 5), (1002, [aircraft()], 5)])
        self.assertEqual(m.violations, 1)

    def test_missing_aircraft_and_unknown_own_position_together(self):
        m = self.run_frames([(1000, [aircraft()], 5), (1001, [], None), (1002, [aircraft()], 5)])
        self.assertEqual(m.violations, 1)

    def test_absent_longer_than_stale_then_back_inside_counts_again(self):
        frames = [(1000, [aircraft()], 5)] + [(1000 + s, [], 5) for s in range(1, 5)] + [(1005, [aircraft()], 5)]
        self.assertEqual(self.run_frames(frames).violations, 2)

    def test_back_outside_after_dropout_then_reentry_counts_again(self):
        m = self.run_frames([(1000, [aircraft()], 5), (1001, [], 5), (1002, [aircraft()], 200),
                             (1003, [aircraft()], 5)])
        self.assertEqual(m.violations, 2)

    def test_other_aircraft_in_frame_do_not_reset_an_absent_one(self):
        other = aircraft("B", east=500)
        m = self.run_frames([(1000, [aircraft(), other], 5), (1001, [other], 5), (1002, [aircraft(), other], 5)])
        self.assertEqual(m.violations, 1)


class TestOwnPosition(unittest.TestCase):
    def test_fresh_position_passes_through(self):
        self.assertEqual(fresh_position(49.0, -122.0, 100.0, 1000.0, 1000.0 + OWN_POSITION_STALE_S),
                         (49.0, -122.0, 100.0))

    def test_stale_or_missing_position_is_unknown(self):
        self.assertEqual(fresh_position(49.0, -122.0, 100.0, 1000.0, 1000.0 + OWN_POSITION_STALE_S + 0.1),
                         (None, None, None))
        self.assertEqual(fresh_position(49.0, -122.0, 100.0, None, 1000.0), (None, None, None))


class TestFeedHandling(unittest.TestCase):
    def test_huge_integers_are_rejected_not_raised(self):
        self.assertIsNone(parse_aircraft({**aircraft(), "latitude": 10**400}))
        self.assertIsNone(parse_aircraft({**aircraft(), "altitude_m": -10**400}))
        m = TrafficMonitor()
        self.assertTrue(m.update({"type": "traffic", "timestamp": 10**400, "aircraft": [aircraft()]}, received_at=1.0))
        self.assertIsNone(m.server_timestamp)
        self.assertEqual(len(m.aircraft), 1)

    def test_stale_after_no_frames(self):
        m = TrafficMonitor()
        self.assertTrue(m.snapshot(now=0)["stale"])  # never received anything
        m.update(frame(aircraft()), received_at=1000.0)
        self.assertFalse(m.snapshot(now=1000.0 + STALE_AFTER_S)["stale"])
        self.assertTrue(m.snapshot(now=1000.0 + STALE_AFTER_S + 0.1)["stale"])

    def test_rejects_malformed_frames_and_keeps_previous(self):
        m = TrafficMonitor()
        m.update(frame(aircraft()), received_at=1000.0)
        for bad in (None, [], {"type": "other"}, {"type": "traffic", "aircraft": "x"}):
            self.assertFalse(m.update(bad, received_at=1001.0))
        self.assertEqual(m.received_at, 1000.0)
        self.assertEqual(len(m.aircraft), 1)

    def test_drops_bad_aircraft_entries(self):
        nan_frame = json.loads('{"id": "X", "latitude": NaN, "longitude": 0, "altitude_m": 1,'
                               ' "keepout_radius_m": 1, "keepout_height_m": 1}')
        bad = [
            nan_frame,
            {**aircraft(), "id": ""},
            {**aircraft(), "latitude": 95.0},
            {**aircraft(), "altitude_m": "100"},
            {**aircraft(), "altitude_m": True},
            {**aircraft(), "keepout_radius_m": 0},
            {k: v for k, v in aircraft().items() if k != "longitude"},
            "not a dict",
        ]
        for entry in bad:
            self.assertIsNone(parse_aircraft(entry), entry)
        m = TrafficMonitor()
        self.assertTrue(m.update(frame(*bad, aircraft("GOOD"), aircraft("GOOD")), received_at=1.0))
        self.assertEqual([ac["id"] for ac in m.aircraft], ["GOOD"])  # bad dropped, duplicate dropped

    def test_snapshot_is_json_safe(self):
        m = TrafficMonitor()
        m.update(frame(aircraft()), received_at=1000.0)
        status_at(m, east=5)
        json.dumps(m.snapshot(now=1000.0), allow_nan=False)


if __name__ == "__main__":
    unittest.main()
