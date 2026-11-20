// Frontend-only demo model. Replace this adapter with real tag/session data later.
export type Position = { latitude: number; longitude: number };
export type TrackerFix = Position & {
  timestamp: string;
  accuracyM: number | null;
};
export type Scenario =
  "tracking" | "unsafe" | "tag-lost" | "uav-lost" | "no-data";
export type AuditEvent = {
  timestamp: string;
  kind: "INFO" | "WARN" | "STAGE" | "OPR";
  message: string;
};
export type TrackerState = {
  now: number;
  windowEndsAt: number;
  trajectoryStartedAt: number | null;
  attached: boolean;
  targetConfirmed: boolean;
  exported: boolean;
  submitted: boolean;
  paused: boolean;
  scenario: Scenario;
  fixes: TrackerFix[];
  uav: Position | null;
  uavUpdatedAt: number | null;
  events: AuditEvent[];
};
export const SEARCH_CENTER: Position = {
  latitude: 50.0970884,
  longitude: -110.7328077,
};
export const STALE_AFTER_MS = 3000;
export const TRAJECTORY_MS = 300_000;
export function offset(
  position: Position,
  north: number,
  east: number,
): Position {
  return {
    latitude: position.latitude + north / 111_111,
    longitude:
      position.longitude +
      east / (111_111 * Math.cos((position.latitude * Math.PI) / 180)),
  };
}
export function horizontalDistance(a: Position, b: Position): number {
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians;
  const dLon = (b.longitude - a.longitude) * radians;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * radians) *
      Math.cos(b.latitude * radians) *
      Math.sin(dLon / 2) ** 2;
  return (
    6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
  );
}
export function animalAt(seconds: number): Position {
  return offset(
    SEARCH_CENTER,
    0.55 * seconds,
    0.38 * seconds + 10 * Math.sin(seconds / 25),
  );
}
function makeFix(seconds: number, epoch: number): TrackerFix {
  return {
    ...animalAt(seconds),
    timestamp: new Date(epoch + seconds * 1000).toISOString(),
    accuracyM: 0.65,
  };
}
export function isFresh(timestamp: number | null, now: number): boolean {
  return (
    timestamp !== null &&
    now - timestamp >= 0 &&
    now - timestamp <= STALE_AFTER_MS
  );
}
export function currentSeparation(state: TrackerState): number | null {
  const fix = state.fixes.at(-1);
  if (
    !fix ||
    !state.uav ||
    !isFresh(Date.parse(fix.timestamp), state.now) ||
    !isFresh(state.uavUpdatedAt, state.now)
  )
    return null;
  return horizontalDistance(fix, state.uav);
}
export function createDemo(now = Date.now(), ready = false): TrackerState {
  const epoch = ready ? now : now - 102_000;
  const fixes = ready
    ? [makeFix(0, epoch)]
    : Array.from({ length: 103 }, (_, i) => makeFix(i, epoch));
  return {
    now,
    windowEndsAt: now + 1122_000,
    trajectoryStartedAt: ready ? null : epoch,
    attached: !ready,
    targetConfirmed: !ready,
    exported: false,
    submitted: false,
    paused: false,
    scenario: "tracking",
    fixes,
    uav: offset(fixes.at(-1)!, 120, 77),
    uavUpdatedAt: now,
    events: ready
      ? [
          {
            timestamp: new Date(now).toISOString(),
            kind: "INFO",
            message:
              "New demo session. Confirm the target and attachment to begin.",
          },
        ]
      : [
          {
            timestamp: new Date(epoch).toISOString(),
            kind: "STAGE",
            message:
              "Five-minute trajectory started at safe horizontal offset.",
          },
          {
            timestamp: new Date(epoch - 1000).toISOString(),
            kind: "OPR",
            message: "Target and hook-and-loop attachment confirmed (demo).",
          },
          {
            timestamp: new Date(epoch - 2000).toISOString(),
            kind: "INFO",
            message: "Demo receiver connected. All telemetry is simulated.",
          },
        ],
  };
}
export function trackingCSV(fixes: TrackerFix[]): string {
  const unique = new Map<string, TrackerFix>();
  for (const fix of fixes) {
    if (
      !Number.isFinite(Date.parse(fix.timestamp)) ||
      !Number.isFinite(fix.latitude) ||
      !Number.isFinite(fix.longitude) ||
      Math.abs(fix.latitude) > 90 ||
      Math.abs(fix.longitude) > 180
    )
      continue;
    unique.set(new Date(fix.timestamp).toISOString(), fix);
  }
  return (
    "timestamp,latitude,longitude\r\n" +
    [...unique.entries()]
      .sort(([a], [b]) => Date.parse(a) - Date.parse(b))
      .map(
        ([timestamp, fix]) =>
          `${timestamp},${fix.latitude.toFixed(7)},${fix.longitude.toFixed(7)}`,
      )
      .join("\r\n") +
    "\r\n"
  );
}
export function recordingGaps(fixes: TrackerFix[]): number {
  const times = [...new Set(fixes.map((f) => Date.parse(f.timestamp)))].sort(
    (a, b) => a - b,
  );
  return times.slice(1).filter((t, i) => t - times[i] > 2000).length;
}
export type Action =
  | { type: "tick" }
  | { type: "scenario"; value: Scenario }
  | { type: "pause" }
  | { type: "reset"; now: number }
  | { type: "confirm-target" }
  | { type: "attach" }
  | { type: "start" }
  | { type: "export" }
  | { type: "submit" };
function log(
  state: TrackerState,
  kind: AuditEvent["kind"],
  message: string,
): TrackerState {
  return {
    ...state,
    events: [
      { timestamp: new Date(state.now).toISOString(), kind, message },
      ...state.events,
    ].slice(0, 100),
  };
}
export function trackerReducer(
  state: TrackerState,
  action: Action,
): TrackerState {
  switch (action.type) {
    case "reset":
      return createDemo(action.now, true);
    case "pause":
      return { ...state, paused: !state.paused };
    case "scenario":
      return log(
        { ...state, scenario: action.value },
        action.value === "tracking" ? "INFO" : "WARN",
        `Demo scenario: ${action.value.replaceAll("-", " ")}.`,
      );
    case "confirm-target":
      return log(
        { ...state, targetConfirmed: true },
        "OPR",
        "Target identified by coloured bands on all four legs (demo).",
      );
    case "attach":
      return state.targetConfirmed
        ? log(
            { ...state, attached: true },
            "OPR",
            "One tracker attached using hook-and-loop, confirmed by operator (demo).",
          )
        : state;
    case "start": {
      const separation = currentSeparation(state);
      if (
        !state.attached ||
        state.trajectoryStartedAt !== null ||
        separation === null ||
        separation < 100 ||
        state.now >= state.windowEndsAt
      )
        return state;
      return log(
        { ...state, trajectoryStartedAt: state.now },
        "STAGE",
        "Five-minute trajectory started at safe horizontal offset.",
      );
    }
    case "export":
      return state.fixes.length
        ? log(
            { ...state, exported: true },
            "OPR",
            "Demo tracking CSV exported locally. File has not been submitted.",
          )
        : state;
    case "submit":
      return state.exported
        ? log(
            { ...state, submitted: true },
            "OPR",
            "Operator marked demo file as submitted. No file was sent by this application.",
          )
        : state;
    case "tick": {
      if (state.paused) return state;
      const now = state.now + 1000;
      const start = state.trajectoryStartedAt;
      const seconds =
        start === null
          ? 0
          : Math.max(
              0,
              Math.min(300, (Math.min(now, state.windowEndsAt) - start) / 1000),
            );
      const animal = animalAt(seconds);
      const hasTag =
        state.scenario !== "tag-lost" && state.scenario !== "no-data";
      const hasUav =
        state.scenario !== "uav-lost" && state.scenario !== "no-data";
      const fix = {
        ...animal,
        timestamp: new Date(now).toISOString(),
        accuracyM: 0.65,
      };
      let next: TrackerState = {
        ...state,
        now,
        fixes: hasTag ? [...state.fixes, fix].slice(-2400) : state.fixes,
        uav: hasUav
          ? offset(
              animal,
              state.scenario === "unsafe" ? 45 : 120,
              state.scenario === "unsafe" ? 30 : 77,
            )
          : state.uav,
        uavUpdatedAt: hasUav ? now : state.uavUpdatedAt,
      };
      const before = currentSeparation(state),
        after = currentSeparation(next);
      if (after === null && before !== null)
        next = log(
          next,
          "WARN",
          "Position data is stale. UAV-to-animal separation is unknown.",
        );
      else if (
        after !== null &&
        after < 100 &&
        (before === null || before >= 100)
      )
        next = log(
          next,
          "WARN",
          "Horizontal separation below the required 100 m minimum.",
        );
      else if (
        after !== null &&
        after >= 100 &&
        (before === null || before < 100)
      )
        next = log(
          next,
          "INFO",
          "Fresh positions received. Safe horizontal offset restored.",
        );
      if (
        start !== null &&
        state.now < start + TRAJECTORY_MS &&
        now >= start + TRAJECTORY_MS &&
        state.windowEndsAt >= start + TRAJECTORY_MS
      )
        next = log(
          next,
          "STAGE",
          "Five-minute trajectory complete. Maintain separation until the flight window ends.",
        );
      if (state.now < state.windowEndsAt && now >= state.windowEndsAt)
        next = log(
          next,
          "WARN",
          "Flight window ended. CSV submission deadline has passed.",
        );
      return next;
    }
  }
}
