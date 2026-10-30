import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addApplication,
  addDays,
  applicationsByStatus,
  emptyState,
  levelFor,
  logEvent,
  totalXp,
  weekStart,
  weeklyProgress,
} from "../src/core.js";

function withApp(state = emptyState()) {
  return addApplication(state, { company: "Acme", role: "Engineer", date: "2026-10-01" });
}

test("addApplication requires a company and a role", () => {
  assert.throws(() => addApplication(emptyState(), { company: "", role: "Dev", date: "2026-10-01" }));
  assert.throws(() => addApplication(emptyState(), { company: "Acme", role: " ", date: "2026-10-01" }));
});

test("addApplication trims fields and does not mutate the input state", () => {
  const before = emptyState();
  const after = addApplication(before, { company: " Acme ", role: " Engineer ", date: "2026-10-01" });
  assert.equal(before.applications.length, 0);
  assert.equal(after.applications[0].company, "Acme");
  assert.equal(after.applications[0].role, "Engineer");
});

test("logEvent rejects unknown event types", () => {
  const state = withApp();
  assert.throws(() => logEvent(state, state.applications[0].id, "ghosted", "2026-10-02"));
});

test("XP follows the rules, and rejections give no points", () => {
  let state = withApp();
  const id = state.applications[0].id;
  state = logEvent(state, id, "applied", "2026-10-01"); // 10
  state = logEvent(state, id, "tailored", "2026-10-01"); // 5
  state = logEvent(state, id, "followup", "2026-10-03"); // 5
  state = logEvent(state, id, "interview", "2026-10-07"); // 25
  state = logEvent(state, id, "rejected", "2026-10-08"); // 0
  assert.equal(totalXp(state), 45);
});

test("levels rise every 100 XP", () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(99), 1);
  assert.equal(levelFor(100), 2);
  assert.equal(levelFor(250), 3);
});

test("weekly progress counts events from Monday onward", () => {
  // 2026-10-26 is a Monday.
  assert.equal(weekStart("2026-10-30"), "2026-10-26");
  assert.equal(weekStart("2026-10-25"), "2026-10-19");

  let state = { ...withApp(), weeklyGoal: 4 };
  const id = state.applications[0].id;
  state = logEvent(state, id, "applied", "2026-10-25"); // previous week, not counted
  state = logEvent(state, id, "applied", "2026-10-26");
  state = logEvent(state, id, "tailored", "2026-10-30");
  const progress = weeklyProgress(state, "2026-10-30");
  assert.deepEqual(progress, { count: 2, goal: 4, ratio: 0.5 });
});

test("weekly progress caps the bar at 100 percent", () => {
  let state = { ...withApp(), weeklyGoal: 1 };
  const id = state.applications[0].id;
  state = logEvent(state, id, "applied", "2026-10-26");
  state = logEvent(state, id, "applied", "2026-10-27");
  assert.equal(weeklyProgress(state, "2026-10-30").ratio, 1);
});

test("addDays crosses month boundaries", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("applications are grouped by their latest event", () => {
  let state = withApp();
  state = addApplication(state, { company: "Beta", role: "Analyst", date: "2026-10-02" });
  const [first, second] = state.applications;
  state = logEvent(state, first.id, "applied", "2026-10-01");
  state = logEvent(state, first.id, "interview", "2026-10-05");
  state = logEvent(state, second.id, "rejected", "2026-10-06");
  assert.deepEqual(applicationsByStatus(state), { new: 0, interview: 1, rejected: 1 });
});
