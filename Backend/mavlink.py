# MAvlink reader
import math
import asyncio
import threading
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pymavlink import mavutil;

# FastAPI
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

telemetryInfo = {
    "latitude": None,
    "longitude": None,
    "altitude": None,
    "relative_altitude": None,
    "battery_percentage": None,
    "roll": None,
    "pitch": None,
    "yaw": None,
    "groundspeed_km": None,
    "battery_voltage": None,
    "battery_current": None,
    "fix_type": None,
    "satellites": None,
    "hdop": None,
    "last_update": None,
}

telemetry_lock = threading.Lock()

# Drone connection
def mavlinkReader():
    # Local mock sim (Backend/sim.py). For DroneSim use tcp:206.189.60.90:<sim port>
    connection = mavutil.mavlink_connection("tcp:127.0.0.1:5760")
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
            # print(f"Plane Position: Latitude = {latitude}, Longitude = {longitude}, Altitude = {altitude}, Relative Altitude = {relative_altitude}")
            telemetryInfo["latitude"] = latitude
            telemetryInfo["longitude"] = longitude
            telemetryInfo["altitude"] = altitude
            telemetryInfo["relative_altitude"] = relative_altitude
            
        elif msg.get_type() == 'SYS_STATUS':
            battery_percentage = msg.battery_remaining
            # print(f"Battery Percentage: {battery_percentage}%")
            telemetryInfo["battery_percentage"] = battery_percentage
            # 65535 / -1 are MAVLink sentinels for "unknown"
            telemetryInfo["battery_voltage"] = None if msg.voltage_battery == 65535 else msg.voltage_battery / 1000.0
            telemetryInfo["battery_current"] = None if msg.current_battery == -1 else msg.current_battery / 100.0
            
        elif msg.get_type() == 'ATTITUDE':
            roll_deg = math.degrees(msg.roll)
            pitch_deg = math.degrees(msg.pitch)
            yaw_deg = math.degrees(msg.yaw)
            # print(f"Roll = {roll_deg}, Pitch = {pitch_deg}, Yaw = {yaw_deg}")
            telemetryInfo["roll"] = roll_deg
            telemetryInfo["pitch"] = pitch_deg
            telemetryInfo["yaw"] = yaw_deg
            
        elif msg.get_type() == 'VFR_HUD':
            groundspeed_km = msg.groundspeed * 3.6
            # print(f"Ground speed = {groundspeed_km}km/h")
            telemetryInfo["groundspeed_km"] = groundspeed_km

        elif msg.get_type() == 'GPS_RAW_INT':
            # fix_type: 0-1 = no fix, 2 = 2D, 3 = 3D, 4+ = DGPS/RTK
            telemetryInfo["fix_type"] = msg.fix_type
            # 255 / 65535 are MAVLink sentinels for "unknown"
            telemetryInfo["satellites"] = None if msg.satellites_visible == 255 else msg.satellites_visible
            telemetryInfo["hdop"] = None if msg.eph == 65535 else msg.eph / 100.0
        
        telemetryInfo["last_update"] = time.time()
        
@app.on_event("startup")
async def startup_event():
    print("Starting MAVLink reader thread...")
    thread = threading.Thread(target=mavlinkReader, daemon=True)
    thread.start()   
    
@app.get("/")
async def root():
    return {"status": "backend running"}


@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Frontend connected to websocket")

    try:
        while True:
            with telemetry_lock:
                snapshot = dict(telemetryInfo)

            await websocket.send_json(snapshot)
            await asyncio.sleep(0.2)
    except WebSocketDisconnect:
        print("Frontend disconnected")
