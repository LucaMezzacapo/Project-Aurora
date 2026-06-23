# Mock drone simulator: local MAVLink TCP source for testing without DroneSim.
# Circles over Burnaby, BC by default, and — for the Send Guided Waypoint feature —
# peels off to fly to any guided waypoint the backend commands, then loiters over it.
# NOTE: this is a demo aid, not a real autopilot. It accepts the exact message our
# backend sends, so it validates the UI + send path, not MAVLink protocol correctness.
# Run: python sim.py   (backend connects to tcp:127.0.0.1:5760)
import math
import time
from pymavlink import mavutil

HOST = "127.0.0.1:5760"
CENTER_LAT = 49.2488
CENTER_LON = -122.9805
RADIUS_M = 400.0
LOITER_RADIUS_M = 80.0      # orbit radius once a guided waypoint is reached
ACCEPT_RADIUS_M = 30.0      # "arrived" threshold for a guided waypoint
SPEED_MS = 18.0
CLIMB_MS = 4.0              # vertical speed toward a target altitude
ALTITUDE_M = 100.0
TICK_S = 0.2

METERS_PER_DEG_LAT = 111_111.0


def meters_per_deg_lon(lat):
    return METERS_PER_DEG_LAT * math.cos(math.radians(lat))


def offset_to_latlon(lat, lon, north, east):
    return lat + north / METERS_PER_DEG_LAT, lon + east / meters_per_deg_lon(lat)


def wrap_to_pi(angle):
    return (angle + math.pi) % (2 * math.pi) - math.pi


def main():
    conn = mavutil.mavlink_connection(f"tcpin:{HOST}", source_system=1, source_component=1)
    print(f"Sim listening on tcp:{HOST} — circling Burnaby ({CENTER_LAT}, {CENTER_LON})")

    omega = SPEED_MS / RADIUS_M          # rad/s around the default circuit
    turn_rate = SPEED_MS / LOITER_RADIUS_M  # max rad/s when manoeuvring/loitering
    bank = math.atan(SPEED_MS**2 / (9.81 * RADIUS_M))
    step = SPEED_MS * TICK_S             # meters travelled per tick

    # Flight state
    mode = "circle"                      # circle | guided | loiter
    target = None                        # (lat, lon, alt) for guided/loiter
    lat, lon = offset_to_latlon(CENTER_LAT, CENTER_LON, RADIUS_M, 0.0)
    alt = ALTITUDE_M
    hdg = 0.0                            # heading, radians

    start = time.time()
    tick = 0

    while True:
        # Drain incoming commands: drives TCP accept and handles guided targets.
        while True:
            msg = conn.recv_match(blocking=False)
            if msg is None:
                break
            if msg.get_type() == 'SET_POSITION_TARGET_GLOBAL_INT':
                target = (msg.lat_int / 1e7, msg.lon_int / 1e7, float(msg.alt))
                mode = "guided"
                print(f"Guided waypoint received: lat={target[0]:.6f} lon={target[1]:.6f} alt={target[2]:.1f} — flying there")

        if conn.port is None:
            time.sleep(0.1)
            continue

        t = time.time() - start

        if mode == "circle":
            theta = omega * t
            lat, lon = offset_to_latlon(CENTER_LAT, CENTER_LON, RADIUS_M * math.cos(theta), RADIUS_M * math.sin(theta))
            hdg = math.atan2(math.cos(theta), -math.sin(theta))  # tangent to the circle
            alt = ALTITUDE_M
        elif mode == "guided":
            north = (target[0] - lat) * METERS_PER_DEG_LAT
            east = (target[1] - lon) * meters_per_deg_lon(lat)
            dist = math.hypot(north, east)
            if dist <= ACCEPT_RADIUS_M:
                mode = "loiter"
                print("Reached guided waypoint — loitering")
            else:
                # Turn toward the target (rate-limited) and step forward.
                desired = math.atan2(east, north)
                hdg += max(-turn_rate * TICK_S, min(turn_rate * TICK_S, wrap_to_pi(desired - hdg)))
                lat, lon = offset_to_latlon(lat, lon, step * math.cos(hdg), step * math.sin(hdg))
                alt += max(-CLIMB_MS * TICK_S, min(CLIMB_MS * TICK_S, target[2] - alt))
        elif mode == "loiter":
            hdg += turn_rate * TICK_S    # constant turn = orbit near the target
            lat, lon = offset_to_latlon(lat, lon, step * math.cos(hdg), step * math.sin(hdg))
            alt = target[2]

        heading = math.degrees(hdg) % 360
        vn, ve = SPEED_MS * math.cos(hdg), SPEED_MS * math.sin(hdg)
        roll = 0.0 if mode == "guided" else bank
        boot_ms = int(t * 1000)

        conn.mav.global_position_int_send(
            boot_ms,
            int(lat * 1e7), int(lon * 1e7),
            int(alt * 1000), int(alt * 1000),
            int(vn * 100), int(ve * 100), 0,
            int(heading * 100),
        )
        conn.mav.attitude_send(
            boot_ms,
            roll,
            math.radians(2.0),          # slight nose-up
            math.radians(heading if heading <= 180 else heading - 360),
            0.0, 0.0, 0.0,
        )
        conn.mav.vfr_hud_send(SPEED_MS, SPEED_MS, int(heading), 55, alt, 0.0)

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
                int(lat * 1e7), int(lon * 1e7), int(alt * 1000),
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
