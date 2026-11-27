import test from "node:test";
import assert from "node:assert/strict";
import { markTrafficStale, parseTraffic, trafficAlert, trafficLive } from "../src/app/traffic.ts";

const aircraft = (overrides = {}) => ({
  id: "SIM-1", latitude: 49.25, longitude: -122.98, altitude_m: 100,
  keepout_radius_m: 30, keepout_height_m: 15,
  horizontal_m: 12.5, vertical_m: 0, status: "inside", ...overrides,
});
const backend = (overrides = {}) => ({
  connected: true, stale: false, received_at: 1795000000.5, server_timestamp: 1795000000.4,
  aircraft: [aircraft()], violations: 2, penalised_violations: 2, points_lost: 10,
  max_points_lost: 25, log: [{ timestamp: 1795000000.5, id: "SIM-1" }], ...overrides,
});

test("feature off: missing or unusable traffic field gives null", () => {
  for (const raw of [undefined, null, "x", 3, []]) assert.equal(parseTraffic(raw), null);
});

test("valid backend snapshot maps to camelCase state", () => {
  const state = parseTraffic(backend());
  assert.deepEqual(state, {
    connected: true, stale: false, receivedAt: 1795000000.5,
    aircraft: [{
      id: "SIM-1", latitude: 49.25, longitude: -122.98, altitudeM: 100,
      keepoutRadiusM: 30, keepoutHeightM: 15, horizontalM: 12.5, verticalM: 0, status: "inside",
    }],
    violations: 2, penalisedViolations: 2, pointsLost: 10, maxPointsLost: 25,
    log: [{ timestamp: 1795000000.5, id: "SIM-1" }],
  });
});

test("invalid aircraft entries are dropped, unknown status and missing distances tolerated", () => {
  const state = parseTraffic(backend({
    aircraft: [
      aircraft({ latitude: 95 }),
      aircraft({ keepout_radius_m: 0 }),
      aircraft({ altitude_m: "100" }),
      aircraft({ id: "" }),
      "nope",
      aircraft({ id: "SIM-2", status: "weird", horizontal_m: null, vertical_m: undefined }),
    ],
  }));
  assert.equal(state.aircraft.length, 1);
  assert.equal(state.aircraft[0].id, "SIM-2");
  assert.equal(state.aircraft[0].status, "unknown");
  assert.equal(state.aircraft[0].horizontalM, null);
  assert.equal(state.aircraft[0].verticalM, null);
});

test("stale unless the backend explicitly says it is fresh", () => {
  assert.equal(parseTraffic(backend({ stale: undefined })).stale, true);
  assert.equal(trafficLive(parseTraffic(backend({ connected: false }))), false);
  assert.equal(trafficLive(parseTraffic(backend())), true);
  assert.equal(trafficLive(markTrafficStale(parseTraffic(backend()))), false);
  assert.equal(markTrafficStale(null), null);
});

test("alert priority: feed down, then inside, then near, then nothing", () => {
  assert.equal(trafficAlert(null), null);
  assert.deepEqual(trafficAlert(parseTraffic(backend({ stale: true }))), { kind: "feed-down" });
  assert.deepEqual(
    trafficAlert(parseTraffic(backend({ aircraft: [aircraft({ id: "A", status: "near" }), aircraft({ id: "B" })] }))),
    { kind: "inside", ids: ["B"] },
  );
  assert.deepEqual(
    trafficAlert(parseTraffic(backend({ aircraft: [aircraft({ status: "near" })] }))),
    { kind: "near", ids: ["SIM-1"] },
  );
  assert.equal(trafficAlert(parseTraffic(backend({ aircraft: [aircraft({ status: "clear" })] }))), null);
});

test("own position unknown pauses the check and gets its own alert", () => {
  const allUnknown = backend({ aircraft: [aircraft({ status: "unknown" }), aircraft({ id: "SIM-2", status: "unknown" })] });
  assert.deepEqual(trafficAlert(parseTraffic(allUnknown)), { kind: "own-unknown" });
  // feed down still wins
  assert.deepEqual(trafficAlert(parseTraffic({ ...allUnknown, stale: true })), { kind: "feed-down" });
  // a known inside status still wins over a single unknown one
  assert.deepEqual(
    trafficAlert(parseTraffic(backend({ aircraft: [aircraft({ id: "A", status: "unknown" }), aircraft({ id: "B" })] }))),
    { kind: "inside", ids: ["B"] },
  );
  // no aircraft at all is not "unknown position"
  assert.equal(trafficAlert(parseTraffic(backend({ aircraft: [] }))), null);
});

test("counters are non-negative whole numbers", () => {
  const state = parseTraffic(backend({ violations: -3, points_lost: Number.NaN, penalised_violations: 2.7 }));
  assert.equal(state.violations, 0);
  assert.equal(state.pointsLost, 0);
  assert.equal(state.penalisedViolations, 2);
});
