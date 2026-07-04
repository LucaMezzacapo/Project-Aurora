// Validation for the Send Guided Waypoint feature: a single operator-entered
// point (latitude, longitude, altitude) commanded to the drone in GUIDED mode.

export type GuidedWaypoint = {
  latitude: number;
  longitude: number;
  altitude: number;
};

// Returns an error message, or null when the waypoint is valid. Callers must
// reject empty fields before coercing with Number(), since Number('') is 0 and
// would pass these range checks.
export function validateGuided(wp: GuidedWaypoint): string | null {
  if (!Number.isFinite(wp.latitude) || wp.latitude < -90 || wp.latitude > 90) {
    return "Latitude must be a number between -90 and 90.";
  }
  if (
    !Number.isFinite(wp.longitude) ||
    wp.longitude < -180 ||
    wp.longitude > 180
  ) {
    return "Longitude must be a number between -180 and 180.";
  }
  if (!Number.isFinite(wp.altitude) || wp.altitude < 0) {
    return "Altitude must be a number of 0 or greater.";
  }
  return null;
}
