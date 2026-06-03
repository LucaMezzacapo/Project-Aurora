# Mock drone simulator: local MAVLink TCP source for testing without DroneSim.
# Flies a fixed-wing circuit over Burnaby, BC. Run: python sim.py
# Backend connects to tcp:127.0.0.1:5760
import math
import time
from pymavlink import mavutil

HOST = "127.0.0.1:5760"
CENTER_LAT = 49.2488
CENTER_LON = -122.9805
RADIUS_M = 400.0
SPEED_MS = 18.0
ALTITUDE_M = 100.0
TICK_S = 0.2

METERS_PER_DEG_LAT = 111_111.0


def main():
    conn = mavutil.mavlink_connection(f"tcpin:{HOST}", source_system=1, source_component=1)
    print(f"Sim listening on tcp:{HOST} — flying circles over Burnaby ({CENTER_LAT}, {CENTER_LON})")

    omega = SPEED_MS / RADIUS_M  # rad/s around the circle
    bank = math.atan(SPEED_MS**2 / (9.81 * RADIUS_M))  # coordinated-turn bank angle
    start = time.time()
    tick = 0

    while True:
        # recv drives the TCP accept and detects disconnects (port resets to None)
        conn.recv_match(blocking=False)
        if conn.port is None:
            time.sleep(0.1)
            continue

        t = time.time() - start
        theta = omega * t
        north = RADIUS_M * math.cos(theta)
        east = RADIUS_M * math.sin(theta)
        lat = CENTER_LAT + north / METERS_PER_DEG_LAT
        lon = CENTER_LON + east / (METERS_PER_DEG_LAT * math.cos(math.radians(CENTER_LAT)))
        vn = -RADIUS_M * omega * math.sin(theta)  # m/s north
        ve = RADIUS_M * omega * math.cos(theta)   # m/s east
        heading = math.degrees(math.atan2(ve, vn)) % 360
        boot_ms = int(t * 1000)

        conn.mav.global_position_int_send(
            boot_ms,
            int(lat * 1e7), int(lon * 1e7),
            int(ALTITUDE_M * 1000), int(ALTITUDE_M * 1000),
            int(vn * 100), int(ve * 100), 0,
            int(heading * 100),
        )
        conn.mav.attitude_send(
            boot_ms,
            bank,                       # constant bank in the turn
            math.radians(2.0),          # slight nose-up
            math.radians(heading if heading <= 180 else heading - 360),
            0.0, 0.0, omega,
        )
        conn.mav.vfr_hud_send(SPEED_MS, SPEED_MS, int(heading), 55, ALTITUDE_M, 0.0)

        if tick % 5 == 0:  # 1 Hz messages
            conn.mav.heartbeat_send(
                mavutil.mavlink.MAV_TYPE_FIXED_WING,
                mavutil.mavlink.MAV_AUTOPILOT_ARDUPILOTMEGA,
                mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED,
                0,
                mavutil.mavlink.MAV_STATE_ACTIVE,
            )
            conn.mav.gps_raw_int_send(
                int(time.time() * 1e6),
                3,                              # 3D fix
                int(lat * 1e7), int(lon * 1e7), int(ALTITUDE_M * 1000),
                120,                            # eph -> HDOP 1.20
                180,                            # epv
                int(SPEED_MS * 100),
                int(heading * 100),
                10 + (tick // 5) % 3,           # 10-12 satellites
            )
            battery_pct = max(0, 100 - int(t / 30))  # drain ~2%/min
            conn.mav.sys_status_send(
                0, 0, 0,
                500,                            # load 50%
                12_400,                         # 12.4 V in mV
                850,                            # 8.5 A in cA
                battery_pct,
                0, 0, 0, 0, 0, 0,
            )

        tick += 1
        time.sleep(TICK_S)


if __name__ == "__main__":
    main()
