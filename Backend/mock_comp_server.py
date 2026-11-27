"""Mock competition server: simulated other-aircraft traffic at 1 Hz (CONOPS Task 1 section 4).

Stands in for aeac.mylonics.com until we have its documentation. It only knows about the
*other* aircraft; our own drone still comes from sim.py over MAVLink. The message format is
our own stand-in (see build_frame) and is the one thing to change once the real docs arrive.

Run, from Backend/, one terminal each:
  python sim.py
  python mock_comp_server.py                              # scripted, same every run
  python mock_comp_server.py --scenario random --seed 42  # random, repeatable with a seed
  AURORA_TRAFFIC_URL=ws://127.0.0.1:8765 python3 -m uvicorn mavlink:app --port 8000
and `npm run dev` in frontend/.

Scripted scenario, laid out around sim.py's 400 m circuit at 100 m (one lap is ~140 s):
  SIM-1  loiters in a 15 m circle on our circuit  -> keep-out violation once per lap
  SIM-2  crosses the circuit 40 m above us        -> horizontal overlap, vertically clear
  SIM-3  orbits 45 m outside our circuit          -> "near" warning only, never inside

Default keep-out zone: 30 m radius, 15 m above and below. The CONOPS gives no size; this is
larger than GPS error yet realistic for small UAVs. Override with --keepout-radius/--keepout-height.
"""
import argparse
import asyncio
import json
import math
import random
import time

import websockets

from sim import ALTITUDE_M, CENTER_LAT, CENTER_LON, RADIUS_M, offset_to_latlon

DEFAULT_PORT = 8765
DEFAULT_KEEPOUT_RADIUS_M = 30.0
DEFAULT_KEEPOUT_HEIGHT_M = 15.0

# Scripted layout (metres / m/s), relative to sim.py's circuit.
# SIM-1 never strays more than 15 m from a point on our path, so our drone always passes within
# 30 m of it (inside the zone), for at least 2 samples at 1 Hz whatever the start timing.
SIM1_LOITER_RADIUS_M = 15.0
SIM1_SPEED_MS = 3.0                    # one slow loop every ~31 s
SIM2_ALTITUDE_M = ALTITUDE_M + 40.0    # 40 m above us: outside the 15 m zone and the 10 m "near" buffer
SIM2_SPEED_MS = 15.0
SIM2_HALF_TRACK_M = 600.0              # flies north-south across the whole circuit
SIM3_ORBIT_RADIUS_M = RADIUS_M + 45.0  # 45 m outside our path: outside 30 m, inside 30 + 30 m "near"
SIM3_SPEED_MS = 16.0

# Random layout.
RANDOM_BOX_HALF_M = 600.0              # aircraft bounce inside a 1.2 km square around the centre
RANDOM_SPEED_MS = (10.0, 25.0)
RANDOM_ALTITUDE_M = (60.0, 140.0)


def bounce(x, half):
    """Fold an unbounded coordinate into [-half, half], reflecting off the edges."""
    period = 4 * half
    y = (x + half) % period
    if y > 2 * half:
        y = period - y
    return y - half


class ScriptedTraffic:
    def __init__(self, center=(CENTER_LAT, CENTER_LON)):
        self.center = center

    def positions(self, t):
        """[(id, latitude, longitude, altitude_m)] at t seconds after the server started."""
        lat0, lon0 = self.center
        # SIM-1: small slow loiter circle centred on our circuit, 90 degrees round from where sim.py starts.
        a = SIM1_SPEED_MS / SIM1_LOITER_RADIUS_M * t
        sim1 = offset_to_latlon(lat0, lon0, SIM1_LOITER_RADIUS_M * math.cos(a),
                                RADIUS_M + SIM1_LOITER_RADIUS_M * math.sin(a))
        # SIM-2: back and forth along the north-south line through the centre.
        sim2 = offset_to_latlon(lat0, lon0, bounce(-SIM2_HALF_TRACK_M + SIM2_SPEED_MS * t, SIM2_HALF_TRACK_M), 0.0)
        # SIM-3: orbits against our direction, so it sweeps past us twice per lap.
        phi = math.pi - SIM3_SPEED_MS * t / SIM3_ORBIT_RADIUS_M
        sim3 = offset_to_latlon(lat0, lon0, SIM3_ORBIT_RADIUS_M * math.cos(phi), SIM3_ORBIT_RADIUS_M * math.sin(phi))
        return [
            ("SIM-1", *sim1, ALTITUDE_M),
            ("SIM-2", *sim2, SIM2_ALTITUDE_M),
            ("SIM-3", *sim3, ALTITUDE_M),
        ]


class RandomTraffic:
    def __init__(self, center=(CENTER_LAT, CENTER_LON), count=3, seed=None):
        self.center = center
        rng = random.Random(seed)
        self.aircraft = []
        for i in range(count):
            heading = rng.uniform(0, 2 * math.pi)
            speed = rng.uniform(*RANDOM_SPEED_MS)
            self.aircraft.append({
                "id": f"RND-{i + 1}",
                "north0": rng.uniform(-RANDOM_BOX_HALF_M, RANDOM_BOX_HALF_M),
                "east0": rng.uniform(-RANDOM_BOX_HALF_M, RANDOM_BOX_HALF_M),
                "v_north": speed * math.cos(heading),
                "v_east": speed * math.sin(heading),
                "altitude_m": rng.uniform(*RANDOM_ALTITUDE_M),
            })

    def positions(self, t):
        lat0, lon0 = self.center
        out = []
        for ac in self.aircraft:
            north = bounce(ac["north0"] + ac["v_north"] * t, RANDOM_BOX_HALF_M)
            east = bounce(ac["east0"] + ac["v_east"] * t, RANDOM_BOX_HALF_M)
            out.append((ac["id"], *offset_to_latlon(lat0, lon0, north, east), ac["altitude_m"]))
        return out


def build_frame(scenario, t, now, keepout_radius_m=DEFAULT_KEEPOUT_RADIUS_M,
                keepout_height_m=DEFAULT_KEEPOUT_HEIGHT_M):
    """Stand-in competition-server message. Altitude is metres above home, like our drone's."""
    return {
        "type": "traffic",
        "timestamp": now,
        "aircraft": [
            {
                "id": ident,
                "latitude": round(lat, 7),
                "longitude": round(lon, 7),
                "altitude_m": round(alt, 1),
                "keepout_radius_m": keepout_radius_m,
                "keepout_height_m": keepout_height_m,
            }
            for ident, lat, lon, alt in scenario.positions(t)
        ],
    }


def make_scenario(args):
    center = args.center
    if args.scenario == "random":
        return RandomTraffic(center, args.count, args.seed)
    return ScriptedTraffic(center)


def parse_center(text):
    try:
        lat, lon = (float(part) for part in text.split(","))
    except ValueError:
        raise argparse.ArgumentTypeError("expected LAT,LON, e.g. 49.2488,-122.9805")
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise argparse.ArgumentTypeError("latitude or longitude out of range")
    return lat, lon


def positive_float(text):
    value = float(text)
    if not math.isfinite(value) or value <= 0:
        raise argparse.ArgumentTypeError("must be a positive number")
    return value


def parse_args(argv=None):
    p = argparse.ArgumentParser(description="Mock competition server: simulated traffic for Task 1 deconfliction.")
    p.add_argument("--scenario", choices=("scripted", "random"), default="scripted")
    p.add_argument("--seed", type=int, default=None, help="random scenario only: same seed, same traffic")
    p.add_argument("--count", type=int, default=3, help="random scenario only: number of aircraft")
    p.add_argument("--center", type=parse_center, default=(CENTER_LAT, CENTER_LON), help="LAT,LON (default: sim.py circuit centre)")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=DEFAULT_PORT)
    p.add_argument("--rate", type=positive_float, default=1.0, help="frames per second (CONOPS: 1 Hz)")
    p.add_argument("--keepout-radius", type=positive_float, default=DEFAULT_KEEPOUT_RADIUS_M, help="metres")
    p.add_argument("--keepout-height", type=positive_float, default=DEFAULT_KEEPOUT_HEIGHT_M, help="metres above and below")
    args = p.parse_args(argv)
    if args.count < 1:
        p.error("--count must be at least 1")
    return args


async def serve(args):
    scenario = make_scenario(args)
    clients = set()

    async def handler(ws, *_):  # *_ absorbs the `path` argument older websockets versions pass
        clients.add(ws)
        print(f"Client connected ({len(clients)} total)")
        try:
            await ws.wait_closed()
        finally:
            clients.discard(ws)
            print(f"Client disconnected ({len(clients)} total)")

    async with websockets.serve(handler, args.host, args.port):
        seed_note = f", seed {args.seed}" if args.scenario == "random" and args.seed is not None else ""
        print(f"Mock competition server on ws://{args.host}:{args.port}: {args.scenario} traffic{seed_note}, "
              f"{args.rate:g} Hz, keep-out {args.keepout_radius:g} m radius / {args.keepout_height:g} m height")
        start = time.monotonic()
        period = 1.0 / args.rate
        next_tick = start
        while True:
            frame = build_frame(scenario, time.monotonic() - start, time.time(),
                                args.keepout_radius, args.keepout_height)
            message = json.dumps(frame, allow_nan=False)
            for ws in list(clients):
                try:
                    await ws.send(message)
                except websockets.ConnectionClosed:
                    clients.discard(ws)
            # Fixed schedule, so the rate doesn't drift the way a plain sleep(1) loop does.
            next_tick += period
            await asyncio.sleep(max(0.0, next_tick - time.monotonic()))


def main(argv=None):
    try:
        asyncio.run(serve(parse_args(argv)))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
