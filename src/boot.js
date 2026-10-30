// Opening sequence: a short terminal-style boot log. It plays once per tab, can be skipped with a click or a key, and is skipped entirely for reduced motion.
import { play } from "./sound.js";

const LINES = [
  "GRINDLOG OS 1.0",
  "mounting effort.ledger ............ ok",
  "calibrating xp curve (100 per level) ... ok",
  "streak module ..................... removed by request",
  "loading applications .............. ok",
  "all systems nominal. welcome back.",
];

export function runBoot(overlay) {
  const log = overlay.querySelector("#boot-log");
  const seen = (() => {
    try {
      return sessionStorage.getItem("grindlog.booted") === "yes";
    } catch {
      return false;
    }
  })();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (seen || reduceMotion) {
    overlay.remove();
    return Promise.resolve();
  }

  return new Promise((done) => {
    let index = 0;
    let timer = null;

    function finish() {
      clearTimeout(timer);
      overlay.classList.add("gone");
      try {
        sessionStorage.setItem("grindlog.booted", "yes");
      } catch {
        // The boot simply plays again on the next load.
      }
      setTimeout(() => {
        overlay.remove();
        done();
      }, 450);
    }

    function next() {
      if (index >= LINES.length) {
        timer = setTimeout(finish, 500);
        return;
      }
      log.append(`${LINES[index]}\n`);
      play("boot");
      index += 1;
      timer = setTimeout(next, 170);
    }

    overlay.addEventListener("click", finish, { once: true });
    window.addEventListener("keydown", finish, { once: true });
    next();
  });
}
