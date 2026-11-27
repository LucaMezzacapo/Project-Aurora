"""Check our drone against other aircraft's keep-out zones (CONOPS Task 1 section 4, Table 5).

The competition server sends every flying UAV's position at 1 Hz. Each simulated UAV has a
cylinder-shaped keep-out zone (horizontal radius plus vertical distance above and below)
that our drone must stay out of. Each entry costs -5 pts, for up to five entries (25 pts).

Limitation: the drone is only checked when a traffic frame arrives (1 Hz). At ~18 m/s a
brief clip through a zone's edge can fall between two samples and go unseen, the same
limit as the Task 2 practice run's separation check.
"""
import math
import time

from practice_mission import separation  # haversine horizontal distance in metres

NEAR_HORIZONTAL_BUFFER_M = 30.0  # "near" = within radius + this ...
NEAR_VERTICAL_BUFFER_M = 10.0    # ... and within height + this
STALE_AFTER_S = 3.0              # no traffic frame for this long -> positions unknown;
                                 # also how long an aircraft may vanish from frames and keep its state
OWN_POSITION_STALE_S = 3.0       # our own position older than this -> keep-out check paused
PENALTY_PER_VIOLATION = 5        # CONOPS Table 5: -5 pts per occurrence
MAX_PENALISED_VIOLATIONS = 5     # only the first five occurrences are penalised
MAX_LOG_ENTRIES = 50

_NUMBER_FIELDS = ("latitude", "longitude", "altitude_m", "keepout_radius_m", "keepout_height_m")


def _finite_number(value):
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:  # integers too large for a float, e.g. 10**400
        return False


def fresh_position(lat, lon, alt, stamp, now):
    """Our position for the keep-out check, or (None, None, None) if it's older than OWN_POSITION_STALE_S."""
    if stamp is None or now - stamp > OWN_POSITION_STALE_S:
        return None, None, None
    return lat, lon, alt


def parse_aircraft(entry):
    """Return a cleaned aircraft dict, or None if any field is missing, non-finite or out of range."""
    if not isinstance(entry, dict):
        return None
    ident = entry.get("id")
    if not isinstance(ident, str) or not ident.strip():
        return None
    values = {name: entry.get(name) for name in _NUMBER_FIELDS}
    if not all(_finite_number(v) for v in values.values()):
        return None
    values = {name: float(v) for name, v in values.items()}
    if not (-90 <= values["latitude"] <= 90 and -180 <= values["longitude"] <= 180):
        return None
    if values["keepout_radius_m"] <= 0 or values["keepout_height_m"] <= 0:
        return None
    return {"id": ident.strip(), **values}


class TrafficMonitor:
    def __init__(self):
        self.connected = False
        self.received_at = None      # local time.time() of the last valid frame
        self.server_timestamp = None # timestamp the server put in that frame
        self.aircraft = []           # latest aircraft list, with evaluation results
        self.current_ids = set()     # ids in the latest frame
        self.last_seen = {}          # id -> received_at of the last frame that contained it
        self.inside_ids = set()      # aircraft whose zone our drone is currently inside
        self.violations = 0
        self.log = []                # [{"timestamp", "id"}], oldest first

    def set_connected(self, connected):
        self.connected = connected

    def update(self, frame, received_at=None):
        """Store a traffic frame. Returns False (and keeps the previous frame) if it is malformed."""
        if not isinstance(frame, dict) or frame.get("type") != "traffic":
            return False
        entries = frame.get("aircraft")
        if not isinstance(entries, list):
            return False

        aircraft, seen = [], set()
        for entry in entries:
            parsed = parse_aircraft(entry)
            if parsed is None or parsed["id"] in seen:
                continue
            seen.add(parsed["id"])
            aircraft.append({**parsed, "horizontal_m": None, "vertical_m": None, "status": "unknown"})

        stamp = frame.get("timestamp")
        self.server_timestamp = float(stamp) if _finite_number(stamp) else None
        self.received_at = time.time() if received_at is None else received_at
        self.aircraft = aircraft
        self.current_ids = seen
        # A missing or invalid entry is not evidence that we left a zone, so an aircraft keeps its
        # inside/outside state while absent. Only after it has been gone longer than STALE_AFTER_S
        # is it forgotten (and coming back while we're inside then counts as a new entry).
        for ident in seen:
            self.last_seen[ident] = self.received_at
        for ident, seen_at in list(self.last_seen.items()):
            if self.received_at - seen_at > STALE_AFTER_S:
                del self.last_seen[ident]
                self.inside_ids.discard(ident)
        return True

    def evaluate(self, own_lat, own_lon, own_alt):
        """Classify every aircraft against our drone's position (altitude above home, metres)."""
        own_known = all(_finite_number(v) for v in (own_lat, own_lon, own_alt))
        if not own_known:
            for ac in self.aircraft:
                ac.update(horizontal_m=None, vertical_m=None, status="unknown")
            return

        own = {"latitude": own_lat, "longitude": own_lon}
        inside_now = set()
        for ac in self.aircraft:
            horizontal = separation(own, ac)
            vertical = abs(own_alt - ac["altitude_m"])
            if horizontal <= ac["keepout_radius_m"] and vertical <= ac["keepout_height_m"]:
                status = "inside"
                inside_now.add(ac["id"])
            elif (horizontal <= ac["keepout_radius_m"] + NEAR_HORIZONTAL_BUFFER_M
                  and vertical <= ac["keepout_height_m"] + NEAR_VERTICAL_BUFFER_M):
                status = "near"
            else:
                status = "clear"
            ac.update(horizontal_m=horizontal, vertical_m=vertical, status=status)

        # One occurrence per entry (outside -> inside), however long the drone stays inside.
        for ident in sorted(inside_now - self.inside_ids):
            self.violations += 1
            self.log.append({"timestamp": self.received_at, "id": ident})
        self.log = self.log[-MAX_LOG_ENTRIES:]
        # Aircraft in this frame are judged on what we see now; absent ones keep their state.
        self.inside_ids = inside_now | (self.inside_ids - self.current_ids)

    def snapshot(self, now=None):
        now = time.time() if now is None else now
        stale = self.received_at is None or now - self.received_at > STALE_AFTER_S
        penalised = min(self.violations, MAX_PENALISED_VIOLATIONS)
        return {
            "connected": self.connected,
            "stale": stale,
            "received_at": self.received_at,
            "server_timestamp": self.server_timestamp,
            "aircraft": [dict(ac) for ac in self.aircraft],
            "violations": self.violations,
            "penalised_violations": penalised,
            "points_lost": penalised * PENALTY_PER_VIOLATION,
            "max_points_lost": MAX_PENALISED_VIOLATIONS * PENALTY_PER_VIOLATION,
            "log": [dict(entry) for entry in self.log],
        }
