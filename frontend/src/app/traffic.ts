// Other-aircraft traffic from the backend's `traffic` field (Task 1 airspace deconfliction).
// The backend only sends this field when it runs with AURORA_TRAFFIC_URL; otherwise it is absent.
export type TrafficStatus = "clear" | "near" | "inside" | "unknown";
export type TrafficAircraft = {
  id: string;
  latitude: number;
  longitude: number;
  altitudeM: number;
  keepoutRadiusM: number;
  keepoutHeightM: number;
  horizontalM: number | null;
  verticalM: number | null;
  status: TrafficStatus;
};
export type TrafficViolation = { timestamp: number | null; id: string };
export type TrafficState = {
  connected: boolean;
  stale: boolean;
  receivedAt: number | null;
  aircraft: TrafficAircraft[];
  violations: number;
  penalisedViolations: number;
  pointsLost: number;
  maxPointsLost: number;
  log: TrafficViolation[];
};
export type TrafficAlert =
  | { kind: "inside"; ids: string[] }
  | { kind: "near"; ids: string[] }
  | { kind: "own-unknown" }
  | { kind: "feed-down" };

const STATUSES: readonly TrafficStatus[] = ["clear", "near", "inside", "unknown"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const finiteOrNull = (value: unknown): number | null => (finite(value) ? value : null);
const count = (value: unknown): number =>
  finite(value) && value >= 0 ? Math.floor(value) : 0;

function parseAircraft(raw: unknown): TrafficAircraft | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || raw.id.trim() === "") return null;
  const { latitude, longitude, altitude_m, keepout_radius_m, keepout_height_m } = raw;
  if (
    !finite(latitude) || !finite(longitude) || !finite(altitude_m) ||
    !finite(keepout_radius_m) || !finite(keepout_height_m) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180 ||
    keepout_radius_m <= 0 || keepout_height_m <= 0
  )
    return null;
  const status = STATUSES.includes(raw.status as TrafficStatus)
    ? (raw.status as TrafficStatus)
    : "unknown";
  return {
    id: raw.id,
    latitude,
    longitude,
    altitudeM: altitude_m,
    keepoutRadiusM: keepout_radius_m,
    keepoutHeightM: keepout_height_m,
    horizontalM: finiteOrNull(raw.horizontal_m),
    verticalM: finiteOrNull(raw.vertical_m),
    status,
  };
}

/** Validate the backend's `traffic` field. Returns null when the feature is off or the field is unusable. */
export function parseTraffic(raw: unknown): TrafficState | null {
  if (!isRecord(raw)) return null;
  const aircraft = Array.isArray(raw.aircraft)
    ? raw.aircraft.map(parseAircraft).filter((a): a is TrafficAircraft => a !== null)
    : [];
  const log = Array.isArray(raw.log)
    ? raw.log.flatMap((entry): TrafficViolation[] =>
        isRecord(entry) && typeof entry.id === "string"
          ? [{ id: entry.id, timestamp: finiteOrNull(entry.timestamp) }]
          : [],
      )
    : [];
  return {
    connected: raw.connected === true,
    stale: raw.stale !== false, // anything but an explicit false counts as stale
    receivedAt: finiteOrNull(raw.received_at),
    aircraft,
    violations: count(raw.violations),
    penalisedViolations: count(raw.penalised_violations),
    pointsLost: count(raw.points_lost),
    maxPointsLost: count(raw.max_points_lost),
    log,
  };
}

/** True when the traffic positions can be trusted right now. */
export function trafficLive(state: TrafficState | null): boolean {
  return state !== null && state.connected && !state.stale;
}

/** The single most urgent thing to tell the operator, or null when all is clear.
 *  Priority: feed down > our own position unknown (check paused) > inside a zone > near a zone. */
export function trafficAlert(state: TrafficState | null): TrafficAlert | null {
  if (state === null) return null;
  if (!trafficLive(state)) return { kind: "feed-down" };
  if (state.aircraft.length > 0 && state.aircraft.every((a) => a.status === "unknown"))
    return { kind: "own-unknown" };
  const inside = state.aircraft.filter((a) => a.status === "inside").map((a) => a.id);
  if (inside.length) return { kind: "inside", ids: inside };
  const near = state.aircraft.filter((a) => a.status === "near").map((a) => a.id);
  if (near.length) return { kind: "near", ids: near };
  return null;
}

/** Mark traffic as no longer current, e.g. when the dashboard loses its backend connection. */
export function markTrafficStale(state: TrafficState | null): TrafficState | null {
  return state === null ? null : { ...state, connected: false, stale: true };
}
