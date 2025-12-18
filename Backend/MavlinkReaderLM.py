# MAvlink reader
import math
import time
from pymavlink import mavutil;


# Drone connection
connection = mavutil.mavlink_connection("tcp:206.189.60.90:41023")
print("Waiting heartbeat...")
hb = connection.wait_heartbeat(timeout=15)
print("Heartbeat:", hb)

while True:
    msg = connection.recv_match(blocking=False)
    
    if msg is None:
        continue
    
    elif msg.get_type() == 'GLOBAL_POSITION_INT':
        print(f"Plane Position: Latitude = {msg.lat / 1e7}, Longitude = {msg.lon / 1e7}, Altitude = {msg.alt / 1000}, Relative Altitude = {msg.relative_alt / 1000}")
        
    elif msg.get_type() == 'SYS_STATUS':
        print(f"Battery Precentage: {msg.battery_remaining}%")
        
    elif msg.get_type() == 'ATTITUDE':
        roll_deg = math.degrees(msg.roll)
        pitch_deg = math.degrees(msg.pitch)
        yaw_deg = math.degrees(msg.yaw)
        print(f"Roll = {roll_deg}, Pitch = {pitch_deg}, Yaw = {yaw_deg}")

    else:
        time.sleep(0.02)