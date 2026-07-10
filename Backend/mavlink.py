# MAvlink reader
import math
import asyncio
import threading
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
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

# ─── Mission state ───
# status: idle | running | paused | emergency_stop (paused/e-stop owned by teammates)
mission_state = {
    "status": "idle",
    "waypoints": [],
}
mission_lock = threading.Lock()

# ─── Shared MAVLink connection ───
# Set once the reader thread has a heartbeat - Connect to Sim (Simon)
connection = None
send_lock = threading.Lock() # reader thread and request handlers never interleave on the socket


class Waypoint(BaseModel):
    latitude: float
    longitude: float
    altitude: float
    order: int


class MissionUpload(BaseModel):
    waypoints: List[Waypoint]


class GuidedWaypoint(BaseModel):
    latitude: float
    longitude: float
    altitude: float


# ─── Guided + mission flight helpers ───
MISSION_ACCEPT_RADIUS_M = 40.0   # how close counts as "reached a waypoint"
WAYPOINT_TIMEOUT_S = 120.0       # give up on a single waypoint after this long


def send_guided_target(lat, lon, alt):
    # Fly to a single point in GUIDED mode. Altitude is relative to home; type_mask
    # ignores velocity/accel/yaw (position only). set_mode + send share send_lock.
    with send_lock:
        connection.set_mode("GUIDED")
        connection.mav.set_position_target_global_int_send(
            0,
            connection.target_system,
            connection.target_component,
            mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
            0b110111111000,
            int(lat * 1e7),
            int(lon * 1e7),
            alt,
            0, 0, 0,
            0, 0, 0,
            0, 0,
        )


def distance_to(lat, lon):
    # Equirectangular distance (m) from the latest telemetry fix to (lat, lon).
    with telemetry_lock:
        cur_lat = telemetryInfo["latitude"]
        cur_lon = telemetryInfo["longitude"]
    if cur_lat is None or cur_lon is None:
        return None
    dn = (lat - cur_lat) * 111_111.0
    de = (lon - cur_lon) * 111_111.0 * math.cos(math.radians(cur_lat))
    return math.hypot(dn, de)


def missionRunner(waypoints):
    # Fly the mission by sending each waypoint as a guided target in order,
    # advancing once the drone is within MISSION_ACCEPT_RADIUS_M. A demo stand-in
    # for real AUTO-mode mission upload. Stops early if the mission is no longer
    # running (e.g. pause / e-stop / reset by another control).
    for wp in waypoints:
        if mission_state["status"] != "running":
            return
        send_guided_target(wp["latitude"], wp["longitude"], wp["altitude"])
        started = time.time()
        while mission_state["status"] == "running":
            d = distance_to(wp["latitude"], wp["longitude"])
            if d is not None and d <= MISSION_ACCEPT_RADIUS_M:
                break
            if time.time() - started > WAYPOINT_TIMEOUT_S:
                print(f"Mission waypoint {wp['order']} not reached in {WAYPOINT_TIMEOUT_S:.0f}s — aborting")
                with mission_lock:
                    mission_state["status"] = "idle"
                return
            time.sleep(0.5)
    with mission_lock:
        if mission_state["status"] == "running":
            mission_state["status"] = "idle"
    print("Mission complete")


# Drone connection
def mavlinkReader():
    global connection
    # Local mock sim (Backend/sim.py). For DroneSim use tcp:206.189.60.90:<sim port>
    conn = mavutil.mavlink_connection("tcp:127.0.0.1:5760")
    print("Waiting heartbeat...")
    hb = conn.wait_heartbeat(timeout=15)
    print("Heartbeat:", hb)
    # Publish only after heartbeat so target_system/component are populated.
    connection = conn

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


@app.get("/mission/status")
async def mission_status():
    with mission_lock:
        return {
            "status": mission_state["status"],
            "waypoint_count": len(mission_state["waypoints"]),
        }


@app.post("/mission/upload")
async def mission_upload(payload: MissionUpload):
    if not payload.waypoints:
        raise HTTPException(status_code=400, detail="Mission must contain at least one waypoint.")

    seen_orders = set()
    for wp in payload.waypoints:
        if not (-90 <= wp.latitude <= 90):
            raise HTTPException(status_code=400, detail=f"Invalid latitude: {wp.latitude}")
        if not (-180 <= wp.longitude <= 180):
            raise HTTPException(status_code=400, detail=f"Invalid longitude: {wp.longitude}")
        if wp.altitude < 0:
            raise HTTPException(status_code=400, detail=f"Invalid altitude: {wp.altitude}")
        if wp.order < 1:
            raise HTTPException(status_code=400, detail=f"Invalid waypoint order: {wp.order}")
        if wp.order in seen_orders:
            raise HTTPException(status_code=400, detail=f"Duplicate waypoint order: {wp.order}")
        seen_orders.add(wp.order)

    with mission_lock:
        mission_state["waypoints"] = [wp.model_dump() for wp in payload.waypoints]
    return {"status": "ok", "waypoint_count": len(payload.waypoints)}


@app.post("/mission/start")
async def mission_start():
    if connection is None:
        raise HTTPException(status_code=503, detail="Not connected to simulator.")
    with mission_lock:
        if not mission_state["waypoints"]:
            raise HTTPException(status_code=400, detail="No mission waypoints available. Upload a mission first.")
        if mission_state["status"] == "running":
            raise HTTPException(status_code=409, detail="A mission is already running.")
        waypoints = sorted(mission_state["waypoints"], key=lambda w: w["order"])
        mission_state["status"] = "running"
    threading.Thread(target=missionRunner, args=(waypoints,), daemon=True).start()
    return {"status": "running", "waypoint_count": len(waypoints)}


@app.post("/waypoint/guided")
async def send_guided_waypoint(wp: GuidedWaypoint):
    if not (-90 <= wp.latitude <= 90):
        raise HTTPException(status_code=400, detail=f"Invalid latitude: {wp.latitude}")
    if not (-180 <= wp.longitude <= 180):
        raise HTTPException(status_code=400, detail=f"Invalid longitude: {wp.longitude}")
    if wp.altitude < 0:
        raise HTTPException(status_code=400, detail=f"Invalid altitude: {wp.altitude}")

    if connection is None:
        raise HTTPException(status_code=503, detail="Not connected to simulator.")

    send_guided_target(wp.latitude, wp.longitude, wp.altitude)
    return {"status": "ok", "waypoint": wp.model_dump()}


@app.post("/mission/pause")
async def mission_pause():
    with mission_lock:
        if mission_state["status"] != "running":
            raise HTTPException(status_code=409, detail="No mission is currently running.")
        mission_state["status"] = "paused"
    return {"status": "paused"}


@app.post("/mission/emergency-stop")
async def mission_emergency_stop():
    with mission_lock:
        mission_state["status"] = "emergency_stop"

    hold_command_sent = False
    if connection is not None:
        with telemetry_lock:
            hold_lat = telemetryInfo["latitude"]
            hold_lon = telemetryInfo["longitude"]
            hold_alt = telemetryInfo["relative_altitude"]
            if hold_alt is None:
                hold_alt = telemetryInfo["altitude"]

        if hold_lat is not None and hold_lon is not None and hold_alt is not None:
            send_guided_target(hold_lat, hold_lon, hold_alt)
            hold_command_sent = True

    return {"status": "emergency_stop", "hold_command_sent": hold_command_sent}


@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Frontend connected to websocket")

    try:
        while True:
            with telemetry_lock:
                snapshot = dict(telemetryInfo)
            with mission_lock:
                snapshot["mission_status"] = mission_state["status"]

            await websocket.send_json(snapshot)
            await asyncio.sleep(0.2)
    except WebSocketDisconnect:
        print("Frontend disconnected")
