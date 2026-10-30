import { test } from "node:test";
import assert from "node:assert/strict";
import { applicationsCsv, eventsCsv } from "../src/csv.js";

const state = {
  version: 1,
  weeklyGoal: 5,
  applications: [
    {
      id: "app-1",
      company: "Acme, Inc.",
      role: 'Engineer "Lead"',
      link: "",
      notes: "Line one\nLine two",
      createdOn: "2026-10-01",
      events: [
        { type: "applied", date: "2026-10-01" },
        { type: "interview", date: "2026-10-05" },
      ],
    },
  ],
};

test("applications CSV quotes commas, quotes and newlines", () => {
  const lines = applicationsCsv(state).split("\n");
  assert.equal(lines[0], "id,company,role,link,added,steps,total_xp,latest_step,notes");
  assert.equal(lines[1], 'app-1,"Acme, Inc.","Engineer ""Lead""",,2026-10-01,2,35,interview,"Line one');
});

test("events CSV has one row per step with its XP", () => {
  const lines = eventsCsv(state).trim().split("\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[1], 'app-1,"Acme, Inc.","Engineer ""Lead""",applied,2026-10-01,10');
  assert.equal(lines[2].endsWith(",interview,2026-10-05,25"), true);
});
