"""Record one Task 2 rehearsal from the simulator's paired, source-timed GPS fixes."""
from datetime import datetime, timezone
import math

APPROACH_SECONDS = 12
DROP_SECONDS = 30
RELEASE_SECONDS = APPROACH_SECONDS + DROP_SECONDS


def practice_phase(elapsed_ms):
    if elapsed_ms is None:
        return "connecting"
    if elapsed_ms < 0:
        return "ready"
    if elapsed_ms < APPROACH_SECONDS * 1000:
        return "approach"
    if elapsed_ms < RELEASE_SECONDS * 1000:
        return "dropping"
    return "released"


TRACK_SECONDS = 300
WINDOW_SECONDS = 600  # Local rehearsal setting


def decode_fix(msg):
    if msg.fix_type < 3 or not (-900000000 <= msg.lat <= 900000000 and
                                -1800000000 <= msg.lon <= 1800000000):
        return None
    
    # The practice simulator sends Unix microseconds, never boot-relative time.
    if not 946684800_000000 <= msg.time_usec < 4102444800_000000:
        return None
    
    stamp = datetime.fromtimestamp(msg.time_usec / 1e6, timezone.utc)
    return dict(timestamp=stamp.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                latitude=msg.lat / 1e7, longitude=msg.lon / 1e7, accuracyM=None)


def separation(a, b):
    lat1, lat2 = map(math.radians, (a["latitude"], b["latitude"]))
    dlon = math.radians(b["longitude"] - a["longitude"])
    h = math.sin((lat2 - lat1) / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
    
    return 12742000 * math.asin(math.sqrt(min(1, h)))


class PracticeMission:
    def __init__(self):
        self.elapsed_ms = None
        self.aircraft_time = None
        self.aircraft = self.tag = None
        self.tag_time = self.start = self.window_end = self.distance = None
        self.violations = 0
        self.fixes = []

    def receive(self, msg):
        stamp = msg.time_usec
        fix = decode_fix(msg)
        if msg.get_type() == "GPS_RAW_INT":
            self.aircraft_time, self.aircraft = stamp, fix
            if self.window_end is None and fix and self.elapsed_ms is not None and self.elapsed_ms >= 0:
                self.window_end = stamp - self.elapsed_ms * 1000 + WINDOW_SECONDS * 1000000
            self.distance = None
            return
        
        if practice_phase(self.elapsed_ms) != "released" or self.window_end is None:
            return
        if self.tag_time is not None and stamp <= self.tag_time:
            return
        
        self.distance = None
        self.tag = fix
        if fix is None:
            return
        
        self.tag_time = stamp
            
        if self.aircraft and self.aircraft_time == stamp:
            self.distance = separation(self.aircraft, fix)
            
            if stamp < self.window_end and self.start is None and self.distance >= 100:
                self.start = stamp
                
            if self.start is not None and stamp <= self.window_end and self.distance < 100:
                self.violations += 1
                
        if self.start is not None and self.start <= stamp <= min(self.start + TRACK_SECONDS * 1000000, self.window_end):
            self.fixes.append(fix)

    def snapshot(self):
        phase = practice_phase(self.elapsed_ms)
        remaining = math.ceil(RELEASE_SECONDS - self.elapsed_ms / 1000) if phase == "dropping" else 0
        return dict(phase=phase, dropSecondsLeft=remaining, aircraft=self.aircraft, tag=self.tag, separation=self.distance,
                    startMs=self.start // 1000 if self.start is not None else None,
                    windowEndMs=self.window_end // 1000 if self.window_end is not None else None,
                    violations=self.violations, fixes=self.fixes.copy())
