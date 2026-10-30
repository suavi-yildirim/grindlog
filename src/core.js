// Pure logic for Grindlog. No DOM or storage access, so it can run in the browser and in Node tests.

export const XP_RULES = {
  applied: 10,
  tailored: 5,
  followup: 5,
  interview: 25,
  offer: 100,
  rejected: 0, // Rejections never cost points, but they still count as effort.
};

export const EVENT_TYPES = Object.keys(XP_RULES);

export const XP_PER_LEVEL = 100;

export function emptyState() {
  return { version: 1, weeklyGoal: 5, applications: [] };
}

// Dates are local calendar days as YYYY-MM-DD, so there are no timezone surprises.
export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, days) {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

// Monday of the week containing the given day.
export function weekStart(key) {
  const date = parseDateKey(key);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return toDateKey(date);
}

export function addApplication(state, { company, role, link = "", notes = "", date }) {
  if (!company?.trim() || !role?.trim()) {
    throw new Error("An application needs a company and a role.");
  }
  const application = {
    id: `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    company: company.trim(),
    role: role.trim(),
    link: link.trim(),
    notes: notes.trim(),
    createdOn: date,
    events: [],
  };
  return { ...state, applications: [...state.applications, application] };
}

export function logEvent(state, applicationId, type, date) {
  if (!EVENT_TYPES.includes(type)) {
    throw new Error(`Unknown event type: ${type}`);
  }
  const applications = state.applications.map((app) =>
    app.id === applicationId ? { ...app, events: [...app.events, { type, date }] } : app,
  );
  return { ...state, applications };
}

export function allEvents(state) {
  return state.applications.flatMap((app) => app.events);
}

export function totalXp(state) {
  return allEvents(state).reduce((sum, event) => sum + (XP_RULES[event.type] ?? 0), 0);
}

export function levelFor(xp) {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

// Number of events logged in the week that contains `today`, compared with the weekly goal.
export function weeklyProgress(state, today) {
  const start = weekStart(today);
  const end = addDays(start, 7);
  const count = allEvents(state).filter((event) => event.date >= start && event.date < end).length;
  const goal = state.weeklyGoal;
  return { count, goal, ratio: goal > 0 ? Math.min(count / goal, 1) : 0 };
}

export function applicationsByStatus(state) {
  // The status is the most recent event type, or "new" before any event is logged.
  const counts = { new: 0 };
  for (const app of state.applications) {
    const last = app.events.at(-1)?.type ?? "new";
    counts[last] = (counts[last] ?? 0) + 1;
  }
  return counts;
}
