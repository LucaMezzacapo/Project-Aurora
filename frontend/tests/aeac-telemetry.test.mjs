import test from "node:test";
import assert from "node:assert/strict";
import { decodeAeacFrame, observedRate, streamStatus } from "../src/app/tracker/aeac-telemetry.ts";

const packet = {
  uav_id: "aurora-v1", timestamp: 1810405350.2,
  latitude: 49.25, longitude: -122.98, altitude_agl_m: 100,
  horizontal_accuracy_m: 2.5, vertical_accuracy_m: 4,
  battery_percentage: 75, flight_mode: "armed-automatic",
  rc_link_status: 0.95, telemetry_link_status: 0.9,
};
const message = (overrides = {}) => ({ aeac_packet: packet, aeac_packet_issues: [], ...overrides });

test("valid complete backend packet retains every required aircraft field and source", () => {
  const frame = decodeAeacFrame(message({ aeac_simulation: true }));
  assert.deepEqual(frame.packet, packet);
  assert.deepEqual(frame.readings, packet);
  assert.equal(frame.simulation, true);
});
test("incomplete packet preserves available aircraft readings without inventing missing values", () => {
  const frame = decodeAeacFrame(message({ aeac_packet: null, latitude: 49.25,
    battery_percentage: 0, altitude_agl_m: null, aeac_packet_issues: ["altitude_agl_m: unavailable"] }));
  assert.equal(frame.packet, null);
  assert.equal(frame.readings.latitude, 49.25);
  assert.equal(frame.readings.battery_percentage, 0);
  assert.equal(frame.readings.altitude_agl_m, undefined);
  assert.deepEqual(frame.issues, ["altitude_agl_m: unavailable"]);
});
test("invalid numeric fields, modes, missing fields and extra fields cannot display as valid", () => {
  for (const patch of [{ rc_link_status: 1.5 }, { latitude: 91 }, { timestamp: NaN },
    { vertical_accuracy_m: Infinity }, { battery_percentage: "75" }, { altitude_agl_m: -1 },
    { flight_mode: "GUIDED" }, { uav_id: " " }, { longitude: undefined }, { animal: "deer" }]) {
    const frame = decodeAeacFrame(message({ aeac_packet: { ...packet, ...patch } }));
    assert.equal(frame.packet, null);
    assert.ok(frame.issues.length);
  }
});
test("zero readings remain valid and backend errors take priority over a non-null packet", () => {
  assert.equal(decodeAeacFrame(message({ aeac_packet: { ...packet, rc_link_status: 0 } })).packet.rc_link_status, 0);
  assert.equal(decodeAeacFrame(message({ aeac_packet_issues: ["stale position"] })).packet, null);
});
test("malformed or old-format messages are rejected instead of refreshing telemetry", () => {
  for (const value of [null, [], "bad", { latitude: 49.25 }, { aeac_packet: "bad" }]) {
    assert.throws(() => decodeAeacFrame(value));
  }
});
test("null packet without diagnostics is visibly incomplete and unknown source stays unknown", () => {
  const frame = decodeAeacFrame({ aeac_packet: null });
  assert.ok(frame.issues.length);
  assert.equal(frame.simulation, null);
});
test("new incomplete message replaces readings rather than retaining an old complete packet", () => {
  decodeAeacFrame(message());
  const frame = decodeAeacFrame({ aeac_packet: null, latitude: null });
  assert.equal(frame.packet, null);
  assert.equal(frame.readings.latitude, undefined);
  assert.equal(frame.readings.flight_mode, undefined);
});
test("transport freshness expires without a new message; disconnect overrides recent data", () => {
  assert.equal(streamStatus("connected", 1000, 2000), "receiving");
  assert.equal(streamStatus("connected", 1000, 4001), "stale");
  assert.equal(streamStatus("disconnected", 1000, 1001), "disconnected");
  assert.equal(streamStatus("connected", null, 1000), "waiting");
  assert.equal(streamStatus("connecting", null, 1000), "connecting");
});
test("observed rate measures actual arrival spacing, including gaps", () => {
  assert.equal(observedRate([]), null);
  assert.equal(observedRate([1000]), null);
  assert.equal(observedRate([1000, 1000]), null);
  assert.equal(observedRate([1000, 2000, 3000]), 1);
  assert.equal(observedRate([1000, 1200, 1400]), 5);
  assert.equal(observedRate([1000, 2000, 5000]), 0.5);
});
