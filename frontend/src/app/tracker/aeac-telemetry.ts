// Browser boundary for the existing /ws/telemetry snapshot. No animal-tag data.
export const FLIGHT_MODES = [
  "off", "idle", "link-lost", "failsafe", "armed-pilot", "armed-automatic",
] as const;
export type FlightMode = (typeof FLIGHT_MODES)[number];
export type AeacPacket = {
  uav_id: string;
  timestamp: number;
  latitude: number;
  longitude: number;
  altitude_agl_m: number;
  horizontal_accuracy_m: number;
  vertical_accuracy_m: number;
  battery_percentage: number;
  flight_mode: FlightMode;
  rc_link_status: number;
  telemetry_link_status: number;
};
export const NUMBER_FIELDS = {
  timestamp: [0, Infinity],
  latitude: [-90, 90],
  longitude: [-180, 180],
  altitude_agl_m: [0, Infinity],
  horizontal_accuracy_m: [0, Infinity],
  vertical_accuracy_m: [0, Infinity],
  battery_percentage: [0, 100],
  rc_link_status: [0, 1],
  telemetry_link_status: [0, 1],
} as const;
export type AeacFrame = {
  packet: AeacPacket | null;
  readings: Partial<AeacPacket>;
  issues: string[];
  simulation: boolean | null;
};
export const STREAM_STALE_MS = 3000;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validReadings(value: Record<string, unknown>): Partial<AeacPacket> {
  const readings: Partial<AeacPacket> = {};
  for (const key of Object.keys(NUMBER_FIELDS) as (keyof typeof NUMBER_FIELDS)[]) {
    const number = value[key];
    const [min, max] = NUMBER_FIELDS[key];
    if (typeof number === "number" && Number.isFinite(number) && number >= min && number <= max) {
      readings[key] = number;
    }
  }
  if (typeof value.uav_id === "string" && value.uav_id.trim()) readings.uav_id = value.uav_id;
  if (typeof value.flight_mode === "string" && FLIGHT_MODES.some(mode => mode === value.flight_mode)) {
    readings.flight_mode = value.flight_mode as FlightMode;
  }
  return readings;
}

export function decodeAeacFrame(value: unknown): AeacFrame {
  if (!record(value) || !("aeac_packet" in value)) {
    throw new Error("Backend message does not include AEAC packet information.");
  }
  const issues = Array.isArray(value.aeac_packet_issues)
    ? value.aeac_packet_issues.filter((issue): issue is string => typeof issue === "string")
    : [];
  let packet: AeacPacket | null = null;
  if (value.aeac_packet !== null) {
    const candidate = value.aeac_packet;
    if (!record(candidate)) throw new Error("Backend AEAC packet is not an object.");
    const validated = validReadings(candidate);
    const fields = [...Object.keys(NUMBER_FIELDS), "uav_id", "flight_mode"];
    const invalid = fields.filter(key => !(key in validated));
    const extra = Object.keys(candidate).filter(key => !fields.includes(key));
    if (invalid.length || extra.length) {
      issues.push(`Received packet has invalid/missing fields or unexpected fields: ${[...invalid, ...extra].join(", ")}.`);
    } else if (!issues.length) {
      packet = validated as AeacPacket;
    }
  } else if (!issues.length) {
    issues.push("Backend has not produced a complete AEAC packet yet.");
  }
  return {
    packet,
    readings: packet ?? validReadings(value),
    issues,
    simulation: typeof value.aeac_simulation === "boolean" ? value.aeac_simulation : null,
  };
}

export function observedRate(arrivals: number[]): number | null {
  if (arrivals.length < 2) return null;
  const duration = arrivals[arrivals.length - 1] - arrivals[0];
  return duration > 0 ? (arrivals.length - 1) * 1000 / duration : null;
}

export function streamStatus(
  connection: "connecting" | "connected" | "disconnected",
  receivedAt: number | null,
  now: number,
): "connecting" | "disconnected" | "waiting" | "stale" | "receiving" {
  if (connection !== "connected") return connection;
  if (receivedAt === null) return "waiting";
  return now - receivedAt > STREAM_STALE_MS ? "stale" : "receiving";
}
