// Waypoint mission parsing + validation for the Start Mission feature.
// A mission file is CSV or JSON; each waypoint needs latitude, longitude,
// altitude, and a travel order.

export type Waypoint = {
  latitude: number;
  longitude: number;
  altitude: number;
  order: number;
};

const REQUIRED_FIELDS = ['latitude', 'longitude', 'altitude', 'order'] as const;

/** Parse a mission file into raw waypoints. Picks CSV vs JSON by extension.
 *  Throws on structural problems (bad type, missing columns); value-level
 *  checks are left to validateWaypoints. */
export function parseMissionFile(fileName: string, text: string): Waypoint[] {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'json') return parseJson(text);
  if (ext === 'csv') return parseCsv(text);
  throw new Error('Unsupported file type. Please upload a .csv or .json file.');
}

function parseJson(text: string): Waypoint[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  if (!Array.isArray(data)) {
    throw new Error('JSON mission must be an array of waypoints.');
  }
  return data.map((row) => toWaypoint(row as Record<string, unknown>));
}

function parseCsv(text: string): Waypoint[] {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');
  if (lines.length < 2) {
    throw new Error('CSV must have a header row and at least one waypoint.');
  }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  for (const field of REQUIRED_FIELDS) {
    if (!header.includes(field)) {
      throw new Error(`CSV is missing required column: ${field}`);
    }
  }
  const col = (name: string) => header.indexOf(name);

  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    return {
      latitude: toNumber(cells[col('latitude')]),
      longitude: toNumber(cells[col('longitude')]),
      altitude: toNumber(cells[col('altitude')]),
      order: toNumber(cells[col('order')]),
    };
  });
}

function toWaypoint(row: Record<string, unknown>): Waypoint {
  return {
    latitude: toNumber(row?.latitude),
    longitude: toNumber(row?.longitude),
    altitude: toNumber(row?.altitude),
    order: toNumber(row?.order),
  };
}

// Coerce to a number, treating missing/empty values as NaN so validation
// catches them. Plain Number() turns "" and null into 0, which would let an
// empty cell pass an "altitude >= 0" check.
function toNumber(value: unknown): number {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'string' && value.trim() === '') return NaN;
  return Number(value);
}

/** Returns a list of human-readable validation errors. Empty list = valid. */
export function validateWaypoints(waypoints: Waypoint[]): string[] {
  const errors: string[] = [];

  if (waypoints.length === 0) {
    errors.push('Mission must contain at least one waypoint.');
    return errors;
  }

  const seenOrders = new Set<number>();
  waypoints.forEach((wp, i) => {
    const n = i + 1;
    if (!Number.isFinite(wp.latitude) || wp.latitude < -90 || wp.latitude > 90) {
      errors.push(`Waypoint ${n}: latitude must be a number between -90 and 90.`);
    }
    if (!Number.isFinite(wp.longitude) || wp.longitude < -180 || wp.longitude > 180) {
      errors.push(`Waypoint ${n}: longitude must be a number between -180 and 180.`);
    }
    if (!Number.isFinite(wp.altitude) || wp.altitude < 0) {
      errors.push(`Waypoint ${n}: altitude must be a number of 0 or greater.`);
    }
    if (!Number.isInteger(wp.order) || wp.order < 1) {
      errors.push(`Waypoint ${n}: order must be a positive whole number.`);
    } else if (seenOrders.has(wp.order)) {
      errors.push(`Waypoint ${n}: duplicate order value ${wp.order}.`);
    } else {
      seenOrders.add(wp.order);
    }
  });

  return errors;
}
