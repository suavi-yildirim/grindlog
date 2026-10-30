import {
  EVENT_TYPES,
  XP_PER_LEVEL,
  XP_RULES,
  addApplication,
  allEvents,
  emptyState,
  levelFor,
  logEvent,
  toDateKey,
  totalXp,
  weeklyProgress,
} from "./src/core.js";

const STORAGE_KEY = "grindlog.v1";
const RING_LENGTH = 2 * Math.PI * 50;

const els = {
  level: document.querySelector("#level"),
  xp: document.querySelector("#xp"),
  nextText: document.querySelector("#next-text"),
  ringFill: document.querySelector("#ring-fill"),
  goalMeter: document.querySelector("#goal-meter"),
  goalText: document.querySelector("#goal-text"),
  goalBanner: document.querySelector("#goal-banner"),
  goalInput: document.querySelector("#goal-input"),
  statApps: document.querySelector("#stat-apps"),
  statInterviews: document.querySelector("#stat-interviews"),
  statWeek: document.querySelector("#stat-week"),
  appsCount: document.querySelector("#apps-count"),
  addForm: document.querySelector("#add-form"),
  formError: document.querySelector("#form-error"),
  appList: document.querySelector("#app-list"),
  empty: document.querySelector("#empty"),
  exportBtn: document.querySelector("#export-btn"),
  importInput: document.querySelector("#import-input"),
  dataError: document.querySelector("#data-error"),
  toasts: document.querySelector("#toasts"),
};

let state = load();
let shownXp = 0;
let goalWasReached = null;

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

function reduceMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// Eases the XP number from its last value to the new one, so gains feel earned.
function countXp(from, to) {
  if (reduceMotion() || from === to) {
    els.xp.textContent = String(to);
    return;
  }
  const duration = 800;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - (1 - t) ** 3;
    els.xp.textContent = String(Math.round(from + (to - from) * eased));
    if (t < 1) {
      requestAnimationFrame(step);
    }
  };
  requestAnimationFrame(step);
}

function render() {
  renderProgress();
  renderApplications();
}

// Updates everything above the list. It never rebuilds the list, so a click on a step button can't be lost to a re-render.
function renderProgress() {
  const today = toDateKey(new Date());
  const xp = totalXp(state);
  const progress = weeklyProgress(state, today);
  const reached = progress.count >= progress.goal;

  els.level.textContent = String(levelFor(xp));
  countXp(shownXp, xp);
  shownXp = xp;
  els.ringFill.style.strokeDashoffset = String(RING_LENGTH * (1 - (xp % XP_PER_LEVEL) / XP_PER_LEVEL));
  els.nextText.textContent = `${XP_PER_LEVEL - (xp % XP_PER_LEVEL)} XP to level ${levelFor(xp) + 1}`;

  renderMeter(progress);
  els.goalText.textContent = `${progress.count} of ${progress.goal} effort steps this week`;
  els.goalInput.value = String(state.weeklyGoal);
  celebrateIfNewlyReached(reached);

  const interviews = allEvents(state).filter((event) => event.type === "interview").length;
  els.statApps.textContent = String(state.applications.length);
  els.statInterviews.textContent = String(interviews);
  els.statWeek.textContent = String(progress.count);
  els.appsCount.textContent = String(state.applications.length);
}

// One segment per goal step. The segments are only rebuilt when the goal changes, so earned ones animate in place.
function renderMeter({ count, goal }) {
  if (els.goalMeter.children.length !== goal) {
    els.goalMeter.style.setProperty("--goal", String(goal));
    els.goalMeter.replaceChildren(
      ...Array.from({ length: goal }, (_, index) => {
        const segment = document.createElement("span");
        segment.style.setProperty("--i", String(index));
        return segment;
      }),
    );
  }
  [...els.goalMeter.children].forEach((segment, index) => {
    segment.classList.toggle("on", index < count);
  });
}

// Plays the celebration only on the change into "goal reached". Loading a page that is already there stays quiet.
function celebrateIfNewlyReached(reached) {
  if (goalWasReached === null) {
    goalWasReached = reached;
  } else if (reached && !goalWasReached) {
    els.goalMeter.classList.add("celebrate");
    setTimeout(() => els.goalMeter.classList.remove("celebrate"), 2600);
  }
  goalWasReached = reached;
  els.goalBanner.hidden = !reached;
}

function toast(text) {
  const note = document.createElement("div");
  note.className = "toast";
  note.textContent = text;
  els.toasts.append(note);
  setTimeout(() => note.remove(), 2400);
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

    const steps = document.createElement("div");
    steps.className = "steps";
    for (const type of EVENT_TYPES) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `+ ${type}`;
      button.addEventListener("click", () => {
        state = logEvent(state, app.id, type, toDateKey(new Date()));
        save();
        render();
        toast(XP_RULES[type] > 0 ? `+${XP_RULES[type]} XP · ${app.company}` : `Logged ${type}. No XP lost.`);
      });
      steps.append(button);
    }

    item.append(title, meta, steps);
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
  toast(`Added ${state.applications.at(-1).company}`);
});

els.goalInput.addEventListener("change", () => {
  const goal = Number.parseInt(els.goalInput.value, 10);
  if (Number.isInteger(goal) && goal > 0) {
    state = { ...state, weeklyGoal: goal };
    save();
    renderProgress();
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
