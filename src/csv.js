// Turns the saved data into two spreadsheet-ready CSV files: one row per application and one row per step.
import { XP_RULES } from "./core.js";

function cell(value) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(header, rows) {
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\n") + "\n";
}

export function applicationsCsv(state) {
  const header = ["id", "company", "role", "link", "added", "steps", "total_xp", "latest_step", "notes"];
  const rows = state.applications.map((app) => {
    const totalXp = app.events.reduce((sum, event) => sum + XP_RULES[event.type], 0);
    return [
      app.id,
      app.company,
      app.role,
      app.link,
      app.createdOn,
      app.events.length,
      totalXp,
      app.events.at(-1)?.type ?? "",
      app.notes,
    ];
  });
  return toCsv(header, rows);
}

export function eventsCsv(state) {
  const header = ["application_id", "company", "role", "step", "date", "xp"];
  const rows = state.applications.flatMap((app) =>
    app.events.map((event) => [app.id, app.company, app.role, event.type, event.date, XP_RULES[event.type]]),
  );
  return toCsv(header, rows);
}
