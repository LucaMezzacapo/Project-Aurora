import unittest
from types import SimpleNamespace

from practice_mission import PracticeMission

EPOCH = 1785537182000000


class PracticeMissionTest(unittest.TestCase):
    def setUp(self):
        self.run = PracticeMission()

    def sample(self, seconds, offset=20000, good=True, aircraft=True):
        fields = dict(time_usec=EPOCH + round(seconds * 1e6), fix_type=3, lon=-1107328077)
        if aircraft:
            self.run.receive(SimpleNamespace(**fields, lat=500970884 + offset,
                                             get_type=lambda: "GPS_RAW_INT"))
        fields["fix_type"] = 3 if good else 0
        self.run.receive(SimpleNamespace(**fields, lat=500970884, get_type=lambda: "GPS2_RAW"))

    def test_only_source_timed_tag_fixes_inside_window(self):
        self.sample(0, offset=0)
        self.sample(1, aircraft=False)
        self.assertIsNone(self.run.start)
        self.sample(2.123)
        self.sample(3, good=False)
        self.sample(4.555, aircraft=False)
        self.sample(4.555)
        self.sample(302.123, offset=0)
        self.sample(303)
        snapshot = self.run.snapshot()
        self.assertEqual(snapshot["violations"], 1)
        self.assertEqual([row["timestamp"][17:] for row in snapshot["fixes"]],
                         ["04.123Z", "06.555Z", "04.123Z"])
        self.assertTrue(all(row["latitude"] == 50.0970884 for row in snapshot["fixes"]))
        self.assertEqual(self.run.start, EPOCH + 2123000)

    def test_early_window_cutoff(self):
        self.sample(0, offset=0)
        self.sample(599)
        self.sample(600)
        self.sample(601)
        self.assertEqual(len(self.run.fixes), 2)
