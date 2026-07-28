import math

def calculate_azimuth(gcs_lat, gcs_lon, drone_lat, drone_lon):
    # Convert degrees to radians
    lat1, lon1 = map(math.radians, [gcs_lat, gcs_lon])
    lat2, lon2 = map(math.radians, [drone_lat, drone_lon])
    
    d_lon = lon2 - lon1
    
    x = math.cos(lat2) * math.sin(d_lon)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(d_lon)
    
    initial_bearing = math.atan2(x, y)
    
    # Convert to degrees and normalize to 0-360
    initial_bearing = math.degrees(initial_bearing)
    compass_bearing = (initial_bearing + 360) % 360
    
    return compass_bearing
