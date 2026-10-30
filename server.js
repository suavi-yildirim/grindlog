// Local companion for saving your data to a private repo. Run it on your own machine with `node server.js`.
// It serves the dashboard and keeps your data in GRINDLOG_DATA_DIR, which should be a clone of your private repo.
// Every save writes the JSON and CSV files, then commits and pushes them. It listens on localhost only.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationsCsv, eventsCsv } from "./src/csv.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(process.env.GRINDLOG_DATA_DIR ?? join(ROOT, "..", "grindlog-data"));
const PORT = Number(process.env.PORT ?? 8000);
const MAX_BODY = 5 * 1024 * 1024;

// Only these files are served, so nothing else in the folder is exposed.
const PUBLIC_FILES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/app.js", "app.js"],
  ["/style.css", "style.css"],
  ["/src/core.js", "src/core.js"],
  ["/src/csv.js", "src/csv.js"],
]);
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function git(args) {
  return new Promise((done, fail) => {
    execFile("git", args, { cwd: DATA_DIR, timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        fail(new Error(stderr.trim() || error.message));
      } else {
        done(stdout.trim());
      }
    });
  });
}

function isValid(data) {
  return (
    data &&
    Array.isArray(data.applications) &&
    data.applications.every(
      (app) =>
        typeof app.id === "string" &&
        typeof app.company === "string" &&
        typeof app.role === "string" &&
        Array.isArray(app.events),
    )
  );
}

async function readData() {
  try {
    return JSON.parse(await readFile(join(DATA_DIR, "grindlog.json"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeData(data) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(join(DATA_DIR, "grindlog.json"), `${JSON.stringify(data, null, 2)}\n`);
  await writeFile(join(DATA_DIR, "applications.csv"), applicationsCsv(data));
  await writeFile(join(DATA_DIR, "events.csv"), eventsCsv(data));

  if (!existsSync(join(DATA_DIR, ".git"))) {
    return { committed: false, pushed: false, error: "The data folder is not a git repo, so nothing was pushed." };
  }
  await git(["add", "-A"]);
  if (!(await git(["diff", "--cached", "--name-only"]))) {
    return { committed: false, pushed: false };
  }
  await git(["commit", "-m", `Update Grindlog data (${new Date().toISOString()})`]);
  try {
    await git(["push", "origin", "HEAD"]);
    return { committed: true, pushed: true };
  } catch (error) {
    return { committed: true, pushed: false, error: error.message };
  }
}

// Saves run one at a time, so two quick edits can't race each other in git.
let saveChain = Promise.resolve();
function saveSerially(data) {
  const result = saveChain.then(() => writeData(data));
  saveChain = result.catch(() => {});
  return result;
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((done, fail) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        fail(new Error("The save is too large."));
        request.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    request.on("end", () => done(Buffer.concat(chunks).toString("utf8")));
    request.on("error", fail);
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");

  try {
    if (url.pathname === "/api/data" && request.method === "GET") {
      return sendJson(response, 200, await readData());
    }

    if (url.pathname === "/api/data" && request.method === "PUT") {
      const data = JSON.parse(await readBody(request));
      if (!isValid(data)) {
        return sendJson(response, 400, { ok: false, error: "That is not a Grindlog export." });
      }
      const result = await saveSerially(data);
      return sendJson(response, 200, { ok: true, ...result });
    }

    const file = PUBLIC_FILES.get(url.pathname);
    if (file && request.method === "GET") {
      const body = await readFile(join(ROOT, file));
      response.writeHead(200, { "Content-Type": CONTENT_TYPES[extname(file)] });
      return response.end(body);
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Grindlog is running at http://localhost:${PORT}/`);
  console.log(`Saving to ${DATA_DIR}`);
});
