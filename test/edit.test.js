import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addApplication,
  emptyState,
  logEvent,
  removeApplication,
  removeEvent,
  updateApplication,
} from "../src/core.js";

function seeded() {
  let state = addApplication(emptyState(), { company: "Acme", role: "Engineer", date: "2026-10-01" });
  state = addApplication(state, { company: "Beta", role: "Analyst", date: "2026-10-02" });
  const [first] = state.applications;
  state = logEvent(state, first.id, "applied", "2026-10-01");
  state = logEvent(state, first.id, "tailored", "2026-10-02");
  return state;
}

test("updateApplication changes only the given fields and trims them", () => {
  const state = seeded();
  const id = state.applications[0].id;
  const next = updateApplication(state, id, { role: "  Staff Engineer ", notes: "Call on Friday" });
  assert.equal(next.applications[0].role, "Staff Engineer");
  assert.equal(next.applications[0].notes, "Call on Friday");
  assert.equal(next.applications[0].company, "Acme");
  assert.equal(next.applications[0].events.length, 2);
  assert.equal(next.applications[1].role, "Analyst");
});

test("updateApplication rejects an empty company or role", () => {
  const state = seeded();
  const id = state.applications[0].id;
  assert.throws(() => updateApplication(state, id, { company: " " }));
  assert.throws(() => updateApplication(state, id, { role: "" }));
});

test("removeApplication drops only that application", () => {
  const state = seeded();
  const next = removeApplication(state, state.applications[0].id);
  assert.equal(next.applications.length, 1);
  assert.equal(next.applications[0].company, "Beta");
});

test("removeEvent drops one step by position and keeps the rest", () => {
  const state = seeded();
  const id = state.applications[0].id;
  const next = removeEvent(state, id, 0);
  assert.deepEqual(next.applications[0].events, [{ type: "tailored", date: "2026-10-02" }]);
});
