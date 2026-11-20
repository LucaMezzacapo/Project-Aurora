import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemo,
  currentSeparation,
  trackerReducer,
  trackingCSV,
  recordingGaps,
  offset,
} from "../src/app/tracker/tracker-model.ts";
const epoch = Date.parse("2026-11-04T12:00:00Z");
const tick = (state, times) => {
  for (let i = 0; i < times; i++)
    state = trackerReducer(state, { type: "tick" });
  return state;
};
test("tag and UAV outages make separation unknown; recovery preserves a recording gap", () => {
  for (const value of ["tag-lost", "uav-lost"]) {
    let state = createDemo(epoch);
    assert.ok(currentSeparation(state) >= 100);
    state = tick(trackerReducer(state, { type: "scenario", value }), 4);
    assert.equal(currentSeparation(state), null);
    state = tick(
      trackerReducer(state, { type: "scenario", value: "tracking" }),
      1,
    );
    assert.ok(currentSeparation(state) >= 100);
    if (value === "tag-lost") assert.equal(recordingGaps(state.fixes), 1);
  }
});
test("trajectory requires target confirmation, attachment, fresh positions and safe offset", () => {
  let state = createDemo(epoch, true);
  assert.equal(
    trackerReducer(state, { type: "start" }).trajectoryStartedAt,
    null,
  );
  assert.equal(trackerReducer(state, { type: "attach" }).attached, false);
  state = trackerReducer(state, { type: "confirm-target" });
  state = trackerReducer(state, { type: "attach" });
  const unsafe = { ...state, uav: offset(state.fixes.at(-1), 25, 0) };
  assert.equal(
    trackerReducer(unsafe, { type: "start" }).trajectoryStartedAt,
    null,
  );
  const stale = { ...state, uavUpdatedAt: epoch - 4000 };
  assert.equal(
    trackerReducer(stale, { type: "start" }).trajectoryStartedAt,
    null,
  );
  const ended = { ...state, windowEndsAt: epoch - 1 };
  assert.equal(
    trackerReducer(ended, { type: "start" }).trajectoryStartedAt,
    null,
  );
  assert.equal(
    trackerReducer(state, { type: "start" }).trajectoryStartedAt,
    epoch,
  );
});
test("trajectory stops movement at five minutes while offset monitoring continues", () => {
  let state = createDemo(epoch);
  state = tick(state, 198);
  const position = state.fixes.at(-1);
  state = tick(state, 20);
  assert.equal(state.fixes.at(-1).latitude, position.latitude);
  state = tick(trackerReducer(state, { type: "scenario", value: "unsafe" }), 1);
  assert.ok(currentSeparation(state) < 100);
});
test("flight window ends trajectory early", () => {
  let state = { ...createDemo(epoch), windowEndsAt: epoch + 1000 };
  state = tick(state, 1);
  const position = state.fixes.at(-1);
  state = tick(state, 20);
  assert.equal(state.fixes.at(-1).latitude, position.latitude);
  assert.ok(
    state.events.some((e) => e.message.includes("deadline has passed")),
  );
});
test("submission export sorts, deduplicates, validates and contains only three columns", () => {
  const fixes = createDemo(epoch).fixes;
  const csv = trackingCSV([
    fixes[2],
    fixes[0],
    fixes[2],
    { ...fixes[1], latitude: NaN },
  ]);
  const rows = csv.trim().split("\r\n");
  assert.equal(rows.length, 3);
  assert.equal(rows[0], "timestamp,latitude,longitude");
  assert.ok(rows.every((row) => row.split(",").length === 3));
  assert.ok(rows[1].startsWith(fixes[0].timestamp));
});
test("pause freezes demo and submission cannot be confirmed before exporting", () => {
  const state = createDemo(epoch);
  assert.equal(trackerReducer(state, { type: "submit" }).submitted, false);
  const paused = trackerReducer(state, { type: "pause" });
  assert.deepEqual(tick(paused, 10), paused);
  const exported = trackerReducer(state, { type: "export" });
  assert.equal(trackerReducer(exported, { type: "submit" }).submitted, true);
});
