# MAvlink reader
import math
import time
from pymavlink import mavutil;


# Drone connection
connection = mavutil.mavlink_connection("tcp:206.189.60.90:41023")
print("Waiting heartbeat...")
hb = connection.wait_heartbeat(timeout=15)
print("Heartbeat:", hb)

# Information messages
while True:
    msg = connection.recv_match(blocking=False)
    
    if msg is None:
        continue
    
    elif msg.get_type() == 'GLOBAL_POSITION_INT':
        latitude = msg.lat / 1e7
        longitude = msg.lon / 1e7
        altitude = msg.alt / 1000
        relative_altitude = msg.relative_alt / 1000
        print(f"Plane Position: Latitude = {latitude}, Longitude = {longitude}, Altitude = {altitude}, Relative Altitude = {relative_altitude}")
        
    elif msg.get_type() == 'SYS_STATUS':
        battery_percentage = msg.battery_remaining
        print(f"Battery Percentage: {battery_percentage}%")
        
    elif msg.get_type() == 'ATTITUDE':
        roll_deg = math.degrees(msg.roll)
        pitch_deg = math.degrees(msg.pitch)
        yaw_deg = math.degrees(msg.yaw)
        print(f"Roll = {roll_deg}, Pitch = {pitch_deg}, Yaw = {yaw_deg}")
        
    elif msg.get_type() == 'VFR_HUD':
        groundspeed_km = msg.groundspeed * 3.6
        print(f"Ground speed = {groundspeed_km}km/h")

    elif msg.get_type() == 'BATTERY_VOLTAGE':
        voltage = msg.voltage / 1000.0
        print(f"Battery Voltage: {voltage}V")
    
    elif msg.get_type() == 'BATTERY_CURRENT':
        current = msg.current / 100.0
        print(f"Battery Current: {current}A")


    else:
        time.sleep(0.002)