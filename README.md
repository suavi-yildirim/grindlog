# Grindlog

A job application tracker that makes applying feel like progress. You earn XP for effort, not outcomes, and missed days never cost you anything.

- **Live site:** https://suavi-yildirim.github.io/grindlog/

## What it does

- Log applications with company, role, link and notes.
- Log effort steps for each application. XP rules:

| Step       | XP  |
| ---------- | --- |
| applied    | 10  |
| tailored   | 5   |
| followup   | 5   |
| interview  | 25  |
| offer      | 100 |
| rejected   | 0   |

- Levels rise every 100 XP.
- A weekly goal bar counts effort steps from Monday onward.
- No streaks and no penalties for rejections or quiet weeks.

## Run it locally

Open `index.html` in a browser for a quick look. The public site works the same way, but it saves only to the browser.

To save your data to a private repo, use the local companion server. Clone your private data repo next to this one, then start the server:

```sh
git clone git@github.com:<you>/grindlog-data.git ../grindlog-data
node server.js
# then open http://localhost:8000/
```

With the server running, every change is saved to `../grindlog-data` as `grindlog.json`, `applications.csv` and `events.csv`. Each save is committed and pushed. **Load from repo** imports the latest copy. Set `GRINDLOG_DATA_DIR` to use another folder, and `PORT` to change the port. The server listens on localhost only.

## Your data

Without the server, the tracker keeps everything in your browser's local storage. Use **Export** to back it up and **Import** to restore it. With the server running, your data also lives in your private repo.

Your application data is personal. Keep exports out of this repository. The `.gitignore` already excludes `data/` and `*.local.json` as a safety net.

## Develop and test

Requires Node 18 or newer. There are no runtime dependencies.

```sh
npm test
```

The core logic lives in `src/core.js`, with no DOM or storage access, so it can be tested directly. The dashboard (`index.html`, `app.js`, `style.css`) only wires that logic to the page.

## Roadmap

- Social layer: shared milestones and friend cheering, opt-in and private by default.
- Optional AI coach, added later because it needs an API key and costs money.
- Optional sync between devices.
