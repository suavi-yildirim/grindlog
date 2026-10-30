// Synthesized sound effects. No audio files are shipped. Sound starts on for most visitors and can be switched off; browsers only start audio after a click, so early sounds stay quiet until then.
const KEY = "grindlog.sound";

let context = null;
let enabled = readPreference();

function readPreference() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

function audio() {
  if (!context) {
    const AudioCtor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioCtor) {
      return null;
    }
    context = new AudioCtor();
  }
  if (context.state === "suspended") {
    context.resume().catch(() => {});
  }
  return context;
}

// One short note with a fast attack and a decay. A slideTo bends the pitch down or up.
function tone(frequency, start, duration, type, volume, slideTo) {
  const ctx = audio();
  if (!ctx) {
    return;
  }
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, t0);
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  }
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

const EFFECTS = {
  tick: () => tone(880, 0, 0.08, "square", 0.05),
  add: () => {
    tone(523, 0, 0.12, "triangle", 0.1);
    tone(784, 0.1, 0.16, "triangle", 0.1);
  },
  goal: () => [523, 659, 784, 1046].forEach((note, i) => tone(note, i * 0.09, 0.24, "triangle", 0.12)),
  remove: () => tone(220, 0, 0.2, "sawtooth", 0.06, 90),
  error: () => tone(160, 0, 0.18, "square", 0.06, 120),
  boot: () => tone(1100 + Math.random() * 500, 0, 0.04, "square", 0.025),
};

export function play(name) {
  if (enabled) {
    EFFECTS[name]?.();
  }
}

export function soundOn() {
  return enabled;
}

export function toggleSound() {
  enabled = !enabled;
  try {
    localStorage.setItem(KEY, enabled ? "on" : "off");
  } catch {
    // Without storage the choice lasts for this visit only.
  }
  if (enabled) {
    play("tick");
  }
  return enabled;
}
