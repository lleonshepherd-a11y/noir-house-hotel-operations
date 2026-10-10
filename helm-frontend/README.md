# Helm: founder console (front-end prototype)

A clickable front end for Helm, a dashboard that shows a founder their whole company: priorities, decisions, blockers, team pulse, money, funding, files and chat. All data is sample data. There is no backend yet.

## Run it locally

You need nothing installed to look at it:

- **Quickest:** double-click `index.html` to open it in Chrome, Safari or Edge.
- **As a local site** (needs Node.js 18 or newer):

  ```bash
  cd helm-frontend
  node serve.mjs
  ```

  Then open http://localhost:5173. Set `PORT=3000` to use a different port.

## Deploy on Railway

1. In Railway, choose **New Project → Deploy from GitHub repo** and pick `noir-house-hotel-operations`.
2. Open the service's **Settings**:
   - **Source → Branch:** `claude/nice-euler-o5jz2b`
   - **Source → Root Directory:** `/helm-frontend`
3. Under **Networking**, click **Generate Domain**.

Railway runs `npm start`, which serves the site on the port Railway provides.

## What's in it

A light, Linear-style app: a compact sidebar on a grey canvas, one white panel with a thin header bar, and the Helm agent panel on the right.

| Screen | How to get there | What it shows |
| --- | --- | --- |
| Briefing | Default view | Priorities, decisions waiting on the CEO, blockers, spend vs plan, teams, activity and comments |
| Murmur (project) | Sidebar → Favorites → Murmur | Properties, KPIs, latest update, the nine stages as milestones, plus Issues, Board, Files, Money and Funding tabs |
| Stages & team | Sidebar → Workspace → Stages & team | The nine company stages and the lean starting team |
| Helm agent | "Ask Helm" in the header | Ask questions about the company. Answers show what they were based on |

Things you can try: ask a suggested question in the agent panel, pick an option on a decision, hover over tiles and the spend chart, drag a board card to another column, reply to a comment with `@name`, and press ⌘K (Ctrl+K) to search.

## Files

- `index.html`: the whole app (HTML, CSS and JavaScript in one file, no build step)
- `serve.mjs`: an optional zero-dependency local server

The next step to make it a real product is splitting this into components (for example React) and connecting it to a backend for projects, tasks, people and spend.
