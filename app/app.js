import {
  EVENT_TYPES,
  XP_RULES,
  addApplication,
  emptyState,
  levelFor,
  logEvent,
  toDateKey,
  totalXp,
  weeklyProgress,
} from "../src/core.js";

const STORAGE_KEY = "grindlog.v1";

const els = {
  level: document.querySelector("#level"),
  xp: document.querySelector("#xp"),
  goalMeter: document.querySelector("#goal-meter"),
  goalText: document.querySelector("#goal-text"),
  goalInput: document.querySelector("#goal-input"),
  addForm: document.querySelector("#add-form"),
  formError: document.querySelector("#form-error"),
  appList: document.querySelector("#app-list"),
  empty: document.querySelector("#empty"),
  exportBtn: document.querySelector("#export-btn"),
  importInput: document.querySelector("#import-input"),
  dataError: document.querySelector("#data-error"),
};

let state = load();

// Local storage can be blocked or full, so every access is guarded and the app still works without it.
function load() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return normalize(JSON.parse(saved));
    }
  } catch {
    // Fall through to an empty state.
  }
  return emptyState();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    els.dataError.textContent = "Could not save to this browser. Export a backup to keep your data.";
  }
}

// Accepts an imported file only when its shape matches what the app writes.
function normalize(data) {
  if (!data || !Array.isArray(data.applications)) {
    throw new Error("This file is not a Grindlog export.");
  }
  const weeklyGoal = Number.isInteger(data.weeklyGoal) && data.weeklyGoal > 0 ? data.weeklyGoal : 5;
  const applications = data.applications.map((app) => ({
    id: String(app.id),
    company: String(app.company),
    role: String(app.role),
    link: String(app.link ?? ""),
    notes: String(app.notes ?? ""),
    createdOn: String(app.createdOn),
    events: (app.events ?? []).filter((event) => EVENT_TYPES.includes(event.type)),
  }));
  return { version: 1, weeklyGoal, applications };
}

function render() {
  const today = toDateKey(new Date());
  const xp = totalXp(state);
  const progress = weeklyProgress(state, today);

  els.level.textContent = String(levelFor(xp));
  els.xp.textContent = String(xp);
  renderMeter(progress);
  els.goalText.textContent =
    progress.count >= progress.goal
      ? `Goal reached: ${progress.count} of ${progress.goal} effort steps this week`
      : `${progress.count} of ${progress.goal} effort steps this week`;
  els.goalInput.value = String(state.weeklyGoal);

  renderApplications();
}

// One segment per goal step. Steps beyond the goal are not drawn, so the meter never overflows.
function renderMeter({ count, goal }) {
  els.goalMeter.style.setProperty("--goal", String(goal));
  els.goalMeter.replaceChildren(
    ...Array.from({ length: goal }, (_, index) => {
      const segment = document.createElement("span");
      if (index < count) {
        segment.className = "on";
      }
      return segment;
    }),
  );
}

function renderApplications() {
  els.appList.replaceChildren();
  els.empty.hidden = state.applications.length > 0;

  for (const app of state.applications) {
    const item = document.createElement("li");

    const title = document.createElement("h3");
    title.className = "app-title";
    title.textContent = `${app.company}: ${app.role}`;

    const meta = document.createElement("div");
    meta.className = "app-meta";
    const lastEvent = app.events.at(-1);
    const appXp = app.events.reduce((sum, event) => sum + XP_RULES[event.type], 0);
    meta.textContent = `Added ${app.createdOn} · ${appXp} XP · ${lastEvent ? `last step: ${lastEvent.type}` : "no steps yet"}`;

    const events = document.createElement("div");
    events.className = "steps";
    for (const type of EVENT_TYPES) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `+ ${type}`;
      button.addEventListener("click", () => {
        state = logEvent(state, app.id, type, toDateKey(new Date()));
        save();
        render();
      });
      events.append(button);
    }

    item.append(title, meta, events);
    if (app.notes) {
      const notes = document.createElement("p");
      notes.className = "app-notes";
      notes.textContent = app.notes;
      item.append(notes);
    }
    els.appList.append(item);
  }
}

els.addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(els.addForm);
  try {
    state = addApplication(state, {
      company: form.get("company"),
      role: form.get("role"),
      link: form.get("link"),
      notes: form.get("notes"),
      date: toDateKey(new Date()),
    });
  } catch (error) {
    els.formError.textContent = error.message;
    return;
  }
  els.formError.textContent = "";
  els.addForm.reset();
  save();
  render();
});

els.goalInput.addEventListener("change", () => {
  const goal = Number.parseInt(els.goalInput.value, 10);
  if (Number.isInteger(goal) && goal > 0) {
    state = { ...state, weeklyGoal: goal };
    save();
    render();
  }
});

els.exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `grindlog-${toDateKey(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

els.importInput.addEventListener("change", async () => {
  const file = els.importInput.files[0];
  if (!file) {
    return;
  }
  try {
    state = normalize(JSON.parse(await file.text()));
    els.dataError.textContent = "";
    save();
    render();
  } catch (error) {
    els.dataError.textContent = error.message;
  } finally {
    els.importInput.value = "";
  }
});

render();
