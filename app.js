import {
  EVENT_TYPES,
  XP_PER_LEVEL,
  XP_RULES,
  addApplication,
  allEvents,
  emptyState,
  levelFor,
  logEvent,
  removeApplication,
  removeEvent,
  toDateKey,
  totalXp,
  updateApplication,
  weeklyProgress,
} from "./src/core.js";
import { startBackground } from "./src/background.js";
import { runBoot } from "./src/boot.js";
import { play, soundOn, toggleSound } from "./src/sound.js";

const STORAGE_KEY = "grindlog.v1";
const WAITING_STEPS = ["applied", "tailored", "followup"];
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
  syncBtn: document.querySelector("#sync-btn"),
  syncStatus: document.querySelector("#sync-status"),
  detail: document.querySelector("#detail"),
  detailBody: document.querySelector("#detail-body"),
  soundBtn: document.querySelector("#sound-btn"),
  xpBars: document.querySelector("#xp-bars"),
  ghostFill: document.querySelector("#ghost-fill"),
  ghostText: document.querySelector("#ghost-text"),
  ghostSub: document.querySelector("#ghost-sub"),
  bg: document.querySelector("#bg"),
  boot: document.querySelector("#boot"),
  toasts: document.querySelector("#toasts"),
};

const API = "/api/data";

let state = load();
let shownXp = 0;
let goalWasReached = null;
let syncOn = false;
let uploading = false;
let queued = false;

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
  if (syncOn) {
    pushState();
  }
}

// Sync runs only when the local companion server (server.js) answers. On the public site there is no server, so it stays off.
async function connectSync() {
  // The public site is never on localhost, so it skips the probe and avoids a console 404 there.
  if (!["localhost", "127.0.0.1"].includes(location.hostname)) {
    return;
  }
  try {
    const response = await fetch(API, { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    syncOn = true;
    els.syncBtn.hidden = false;
    const remote = await response.json();
    if (remote) {
      applyRemote(remote);
      showSync("Loaded from your data repo.");
    } else if (state.applications.length) {
      showSync("Uploading your saved data to your repo.");
      pushState();
    }
  } catch {
    // No server here, so the page keeps working from browser storage alone.
  }
}

function applyRemote(remote) {
  state = normalize(remote);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The repo copy is still the source of truth, so a failed cache write is fine.
  }
  render();
}

async function importFromRepo() {
  try {
    const response = await fetch(API, { cache: "no-store" });
    const remote = await response.json();
    if (!remote) {
      showSync("Your repo has no data yet. Save something first.");
      return;
    }
    applyRemote(remote);
    showSync("Imported from your data repo.");
  } catch (error) {
    showSync(`Could not import from the repo: ${error.message}`, true);
  }
}

// Uploads run one at a time. If the data changes during an upload, the latest version goes up next.
async function pushState() {
  if (uploading) {
    queued = true;
    return;
  }
  uploading = true;
  try {
    do {
      queued = false;
      await upload();
    } while (queued);
  } finally {
    uploading = false;
  }
}

async function upload() {
  try {
    const response = await fetch(API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error ?? "The save failed.");
    }
    if (result.pushed) {
      showSync("Saved and pushed to your data repo.");
    } else if (result.committed) {
      showSync(`Saved on this computer. The push failed: ${result.error}`, true);
    } else {
      showSync(result.error ?? "Saved. Nothing new to commit.");
    }
  } catch (error) {
    showSync(`Not saved to your repo: ${error.message}`, true);
  }
}

function showSync(text, isError = false) {
  els.syncStatus.hidden = false;
  els.syncStatus.textContent = text;
  els.syncStatus.className = isError ? "error" : "muted";
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
  renderLab();
}

// The lab is deliberately playful: a bar chart of steps and a ghost-o-meter for applications that never got past the first steps.
function renderLab() {
  const counts = Object.fromEntries(EVENT_TYPES.map((type) => [type, 0]));
  for (const event of allEvents(state)) {
    counts[event.type] += 1;
  }
  const top = Math.max(1, ...Object.values(counts));
  els.xpBars.replaceChildren(
    ...EVENT_TYPES.map((type) => {
      const fill = el("span", { className: "bar-fill" });
      requestAnimationFrame(() => {
        fill.style.width = `${(counts[type] / top) * 100}%`;
      });
      return el(
        "div",
        { className: "bar-row" },
        el("span", { className: "bar-label", textContent: type }),
        el("span", { className: "bar-track" }, fill),
        el("span", { className: "bar-value", textContent: `${counts[type]} × ${XP_RULES[type]} XP` }),
      );
    }),
  );

  const total = state.applications.length;
  const waiting = state.applications.filter((app) => app.events.length && WAITING_STEPS.includes(app.events.at(-1).type)).length;
  const ratio = total ? waiting / total : 0;
  els.ghostFill.style.width = `${Math.round(ratio * 100)}%`;
  els.ghostText.textContent = !total
    ? "No applications yet, so nothing is haunting you."
    : ratio === 0
      ? "No ghosts. Suspicious, but nice."
      : ratio < 0.5
        ? `${waiting} of ${total} are staring at the ceiling.`
        : `${waiting} of ${total} are waiting on the void. The ghosts are organizing.`;
  els.ghostSub.textContent = "A ghost is an application whose latest step is still applied, tailored or followed up.";
}

function paintSoundButton() {
  els.soundBtn.textContent = soundOn() ? "Sound on" : "Sound off";
  els.soundBtn.setAttribute("aria-pressed", String(soundOn()));
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
    play("goal");
    setTimeout(() => els.goalMeter.classList.remove("celebrate"), 2600);
  }
  goalWasReached = reached;
  els.goalBanner.hidden = !reached;
}

// Small DOM helper: sets properties on a new element and appends its children.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

// Any change from the detail view goes through here, so the list, the progress and the open detail stay in step.
function commit() {
  save();
  render();
  renderDetail();
}

let openId = null;

function openDetail(id) {
  openId = id;
  renderDetail();
  if (!els.detail.open) {
    els.detail.showModal();
  }
}

function renderDetail() {
  const app = state.applications.find((item) => item.id === openId);
  if (!app) {
    els.detail.close();
    return;
  }
  els.detailBody.replaceChildren(...buildDetail(app));
}

// Only web links are made clickable, so a pasted or imported "javascript:" link can't run anything.
function safeLink(link) {
  return /^https?:\/\//.test(link) ? link : null;
}

function buildDetail(app) {
  const nodes = [el("h2", { id: "detail-title", textContent: `${app.company}: ${app.role}` })];

  if (app.link) {
    const href = safeLink(app.link);
    nodes.push(
      el(
        "p",
        { className: "detail-link" },
        href
          ? el("a", { href, target: "_blank", rel: "noopener noreferrer", textContent: app.link })
          : el("span", { textContent: app.link }),
      ),
    );
  }
  if (app.notes) {
    nodes.push(el("p", { className: "app-notes", textContent: app.notes }));
  }
  nodes.push(el("p", { className: "app-meta", textContent: `Added ${app.createdOn}` }));

  // Steps, each with its date, XP and a way to remove a mistake.
  nodes.push(el("h3", { className: "detail-section", textContent: "Steps" }));
  if (!app.events.length) {
    nodes.push(el("p", { className: "muted", textContent: "No steps logged yet." }));
  } else {
    const timeline = el("ol", { className: "timeline" });
    app.events.forEach((event, index) => {
      const remove = el("button", { type: "button", className: "ghost small", textContent: "Remove" });
      remove.addEventListener("click", () => {
        state = removeEvent(state, app.id, index);
        play("remove");
        commit();
      });
      timeline.append(
        el(
          "li",
          {},
          el("span", { className: "step-name", textContent: event.type }),
          el("span", { className: "app-meta", textContent: `${event.date} · ${XP_RULES[event.type]} XP` }),
          remove,
        ),
      );
    });
    nodes.push(timeline);
  }

  // Edit the details. Steps keep their dates and XP.
  nodes.push(el("h3", { className: "detail-section", textContent: "Edit details" }));
  const form = el("form", { className: "edit-form" });
  const formError = el("p", { className: "error", role: "alert" });
  const fields = [
    ["company", "Company", app.company, "input"],
    ["role", "Role", app.role, "input"],
    ["link", "Link", app.link, "input"],
    ["notes", "Notes", app.notes, "textarea"],
  ];
  for (const [name, label, value, tag] of fields) {
    form.append(el("label", {}, label, el(tag, { name, value, rows: tag === "textarea" ? 3 : undefined })));
  }
  form.append(el("div", { className: "form-foot" }, formError, el("button", { type: "submit", textContent: "Save changes" })));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      state = updateApplication(state, app.id, Object.fromEntries(new FormData(form)));
    } catch (error) {
      formError.textContent = error.message;
      return;
    }
    commit();
    toast("Changes saved");
  });
  nodes.push(form);

  // Delete asks for confirmation on the page itself, because browser confirm dialogs are blocked in some views.
  const deleteBtn = el("button", { type: "button", className: "ghost danger", textContent: "Delete application" });
  const confirmRow = el(
    "div",
    { className: "confirm", hidden: true },
    el("p", { className: "error", textContent: "Delete this application and all its steps? This cannot be undone." }),
    el("button", { type: "button", className: "danger", textContent: "Yes, delete" }),
    el("button", { type: "button", className: "ghost", textContent: "Keep it" }),
  );
  deleteBtn.addEventListener("click", () => {
    deleteBtn.hidden = true;
    confirmRow.hidden = false;
  });
  const [yes, keep] = confirmRow.querySelectorAll("button");
  yes.addEventListener("click", () => {
    state = removeApplication(state, app.id);
    els.detail.close();
    commit();
    play("remove");
    toast(`Deleted ${app.company}`);
  });
  keep.addEventListener("click", () => {
    confirmRow.hidden = true;
    deleteBtn.hidden = false;
  });
  nodes.push(el("div", { className: "detail-foot" }, deleteBtn, confirmRow));

  const close = el("button", { type: "button", className: "ghost", textContent: "Close" });
  close.addEventListener("click", () => els.detail.close());
  nodes.push(el("div", { className: "detail-close" }, close));

  return nodes;
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

    const details = el("button", { type: "button", className: "ghost small", textContent: "Details" });
    details.addEventListener("click", () => openDetail(app.id));

    const head = el("div", { className: "app-head" }, title, details);

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
        play(XP_RULES[type] > 0 ? "tick" : "error");
        toast(XP_RULES[type] > 0 ? `+${XP_RULES[type]} XP · ${app.company}` : `Logged ${type}. No XP lost.`);
      });
      steps.append(button);
    }

    item.append(head, meta, steps);
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
  play("add");
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

els.syncBtn.addEventListener("click", importFromRepo);
els.detail.addEventListener("close", () => {
  openId = null;
});

els.soundBtn.addEventListener("click", () => {
  toggleSound();
  paintSoundButton();
});
paintSoundButton();

startBackground(els.bg);
runBoot(els.boot);

render();
connectSync();
