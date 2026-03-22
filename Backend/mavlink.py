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
    "last_update": None,
}

telemetry_lock = threading.Lock()

# Drone connection
def mavlinkReader():
    connection = mavutil.mavlink_connection("tcp:206.189.60.90:34973")
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

        elif msg.get_type() == 'BATTERY_VOLTAGE':
            voltage = msg.voltage / 1000.0
            # print(f"Battery Voltage: {voltage}V")
            telemetryInfo["battery_voltage"] = voltage
        
        elif msg.get_type() == 'BATTERY_CURRENT':
            current = msg.current / 100.0
            # print(f"Battery Current: {current}A")
            telemetryInfo["battery_current"] = current
        
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
