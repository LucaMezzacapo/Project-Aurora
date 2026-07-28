import unittest
from azimuth_calc import calculate_azimuth

class TestAzimuthCalculation(unittest.TestCase):
    def test_due_north(self):
        # Drone is directly north of GCS
        azimuth = calculate_azimuth(0.0, 0.0, 1.0, 0.0)
        self.assertEqual(azimuth, 0.0)
        
    def test_due_east(self):
        # Drone is directly east of GCS
        azimuth = calculate_azimuth(0.0, 0.0, 0.0, 1.0)
        self.assertEqual(azimuth, 90.0)

    def test_due_south(self):
        # Drone is directly south of GCS
        azimuth = calculate_azimuth(0.0, 0.0, -1.0, 0.0)
        self.assertEqual(azimuth, 180.0)
        
    def test_due_west(self):
        # Drone is directly west of GCS
        azimuth = calculate_azimuth(0.0, 0.0, 0.0, -1.0)
        self.assertEqual(azimuth, 270.0)

if __name__ == '__main__':
    unittest.main()