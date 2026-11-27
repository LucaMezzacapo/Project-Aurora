import contextlib
import io
import json
import math
import unittest

from mock_comp_server import (DEFAULT_KEEPOUT_HEIGHT_M, DEFAULT_KEEPOUT_RADIUS_M, RANDOM_ALTITUDE_M,
                              RANDOM_BOX_HALF_M, RANDOM_SPEED_MS, SIM1_LOITER_RADIUS_M, SIM1_SPEED_MS,
                              RandomTraffic, ScriptedTraffic, bounce, build_frame, parse_args)
from practice_mission import separation
from sim import ALTITUDE_M, CENTER_LAT, CENTER_LON, RADIUS_M, SPEED_MS, offset_to_latlon
from traffic_monitor import TrafficMonitor

CENTER = {"latitude": CENTER_LAT, "longitude": CENTER_LON}


def as_points(positions):
    return {ident: {"latitude": lat, "longitude": lon, "altitude_m": alt} for ident, lat, lon, alt in positions}


def our_drone(t):
    """Where sim.py's default circuit puts our drone t seconds after it started."""
    theta = SPEED_MS / RADIUS_M * t
    return offset_to_latlon(CENTER_LAT, CENTER_LON, RADIUS_M * math.cos(theta), RADIUS_M * math.sin(theta))


SIM1_ANCHOR = dict(zip(("latitude", "longitude"), offset_to_latlon(CENTER_LAT, CENTER_LON, 0.0, RADIUS_M)))
LAP_S = 2 * math.pi * RADIUS_M / SPEED_MS


def sim1_inside_runs(statuses):
    """Lengths of consecutive runs of 'inside' samples, i.e. one entry per run."""
    runs, current = [], 0
    for status in statuses:
        if status == "inside":
            current += 1
        elif current:
            runs.append(current)
            current = 0
    if current:
        runs.append(current)
    return runs


class TestScripted(unittest.TestCase):
    def test_layout_matches_the_plan(self):
        scripted = ScriptedTraffic()
        for t in (0, 13, 70, 139):
            p = as_points(scripted.positions(t))
            # SIM-1 loiters within 15 m of a point on our circuit
            self.assertLessEqual(separation(SIM1_ANCHOR, p["SIM-1"]), SIM1_LOITER_RADIUS_M + 1)
            self.assertTrue(RADIUS_M - 16 <= separation(CENTER, p["SIM-1"]) <= RADIUS_M + 16)
            self.assertEqual(p["SIM-1"]["altitude_m"], ALTITUDE_M)
            self.assertEqual(p["SIM-2"]["altitude_m"], ALTITUDE_M + 40)
            self.assertAlmostEqual(separation(CENTER, p["SIM-3"]), RADIUS_M + 45, delta=1)

    def test_sim1_moves_slowly(self):
        scripted = ScriptedTraffic()
        for t in range(0, 60):
            a, b = as_points(scripted.positions(t))["SIM-1"], as_points(scripted.positions(t + 1))["SIM-1"]
            step = separation(a, b)
            self.assertGreater(step, 0.5)                   # it does move ...
            self.assertLessEqual(step, SIM1_SPEED_MS + 0.5)  # ... but only a little

    def test_same_every_run(self):
        self.assertEqual(ScriptedTraffic().positions(42.5), ScriptedTraffic().positions(42.5))

    def test_one_lap_gives_one_sim1_violation_and_sim3_near(self):
        # Our drone and the mock server started at the same moment; 1 Hz for one ~140 s lap.
        monitor, scripted, statuses = TrafficMonitor(), ScriptedTraffic(), {}
        lap_s = 2 * math.pi * RADIUS_M / SPEED_MS
        for t in range(int(lap_s) + 1):
            monitor.update(build_frame(scripted, t, 1000.0 + t), received_at=1000.0 + t)
            monitor.evaluate(*our_drone(t), ALTITUDE_M)
            for ac in monitor.aircraft:
                statuses.setdefault(ac["id"], set()).add(ac["status"])
        self.assertEqual(monitor.violations, 1)
        self.assertEqual([e["id"] for e in monitor.log], ["SIM-1"])
        self.assertNotIn("inside", statuses["SIM-2"])
        self.assertNotIn("near", statuses["SIM-2"])
        self.assertIn("near", statuses["SIM-3"])
        self.assertNotIn("inside", statuses["SIM-3"])

    def test_sim1_hit_once_per_pass_for_any_start_timing(self):
        # Our drone may have started up to a lap before the mock server; sweep that offset.
        # Over 3 laps at 1 Hz: every pass of SIM-1 gives exactly one entry, seen in >= 2 samples.
        scripted = ScriptedTraffic()
        omega = SPEED_MS / RADIUS_M
        duration = int(3 * LAP_S)
        for step in range(int(LAP_S / 0.5)):
            tau = step * 0.5
            # passes through SIM-1's anchor: theta(t + tau) = pi/2 + 2*pi*k
            passes = [(math.pi / 2 + 2 * math.pi * k) / omega - tau for k in range(5)]
            passes = [p for p in passes if -5 <= p <= duration + 5]
            if any(p < 3 or p > duration - 3 for p in passes):
                continue  # a pass cut off at either end of the window; covered by other offsets
            monitor, statuses = TrafficMonitor(), []
            for t in range(duration):
                monitor.update(build_frame(scripted, t, 1000.0 + t), received_at=1000.0 + t)
                monitor.evaluate(*our_drone(t + tau), ALTITUDE_M)
                statuses.append(next(a["status"] for a in monitor.aircraft if a["id"] == "SIM-1"))
            runs = sim1_inside_runs(statuses)
            self.assertEqual(monitor.violations, len(passes), f"offset {tau}")
            self.assertEqual(len(runs), len(passes), f"offset {tau}")
            self.assertGreaterEqual(min(runs), 2, f"offset {tau}")


class TestRandom(unittest.TestCase):
    def test_same_seed_same_traffic(self):
        a, b = RandomTraffic(seed=42), RandomTraffic(seed=42)
        for t in (0, 1, 60, 600):
            self.assertEqual(a.positions(t), b.positions(t))
        self.assertNotEqual(RandomTraffic(seed=1).positions(10), RandomTraffic(seed=2).positions(10))

    def test_stays_in_box_and_ranges(self):
        traffic = RandomTraffic(count=5, seed=7)
        previous = None
        for t in range(0, 300):
            points = as_points(traffic.positions(t))
            self.assertEqual(len(points), 5)
            for ident, p in points.items():
                self.assertLessEqual(separation(CENTER, p), RANDOM_BOX_HALF_M * math.sqrt(2) + 1)
                self.assertTrue(RANDOM_ALTITUDE_M[0] <= p["altitude_m"] <= RANDOM_ALTITUDE_M[1])
                if previous:  # 1 s apart: never faster than the top speed, even when bouncing
                    self.assertLessEqual(separation(previous[ident], p), RANDOM_SPEED_MS[1] + 0.5)
            previous = points


class TestFrameAndArgs(unittest.TestCase):
    def test_frame_shape_is_json_safe_and_accepted_by_monitor(self):
        f = build_frame(ScriptedTraffic(), 5.0, 1234.5)
        json.dumps(f, allow_nan=False)
        self.assertEqual(f["type"], "traffic")
        self.assertEqual(f["timestamp"], 1234.5)
        self.assertEqual([ac["id"] for ac in f["aircraft"]], ["SIM-1", "SIM-2", "SIM-3"])
        for ac in f["aircraft"]:
            self.assertEqual(ac["keepout_radius_m"], DEFAULT_KEEPOUT_RADIUS_M)
            self.assertEqual(ac["keepout_height_m"], DEFAULT_KEEPOUT_HEIGHT_M)
        monitor = TrafficMonitor()
        self.assertTrue(monitor.update(f, received_at=1.0))
        self.assertEqual(len(monitor.aircraft), 3)

    def test_bounce_stays_in_range(self):
        for x in range(-5000, 5000, 37):
            self.assertTrue(-600 <= bounce(x, 600) <= 600)
        self.assertEqual(bounce(100, 600), 100)
        self.assertEqual(bounce(700, 600), 500)  # reflected off the +600 edge

    def test_args(self):
        args = parse_args(["--scenario", "random", "--seed", "3", "--center", "50.1,-110.7", "--keepout-radius", "40"])
        self.assertEqual((args.scenario, args.seed, args.center, args.keepout_radius), ("random", 3, (50.1, -110.7), 40.0))
        defaults = parse_args([])
        self.assertEqual((defaults.scenario, defaults.port, defaults.rate), ("scripted", 8765, 1.0))
        for bad in (["--rate", "0"], ["--center", "nope"], ["--count", "0"], ["--scenario", "x"]):
            # argparse prints usage to stderr when it rejects arguments; keep test output clean
            with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
                parse_args(bad)


if __name__ == "__main__":
    unittest.main()
