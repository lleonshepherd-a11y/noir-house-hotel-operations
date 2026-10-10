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

## What's in it

| Screen | How to get there | What it shows |
| --- | --- | --- |
| Home | Default view | Company priorities with progress rings, decisions waiting on the CEO, projects needing attention, cross-team blockers, spend vs plan chart, live activity, team pulse |
| Murmur (project) | Sidebar → Projects → Murmur | Project header, 9-stage track, KPIs, team lanes, sign-offs, drag-and-drop board, chat with @mentions and #tags, spend, funding, files |
| Stages & team | Sidebar → Stages & team | The nine company stages with who is involved, plus the lean starting team |

Things you can try: click a suggested question under the ask bar, pick an option on a decision, hover over the spend chart, drag a board card to another column, and send a chat message with `@name` or `#tag`.

## Files

- `index.html`: the whole app (HTML, CSS and JavaScript in one file, no build step)
- `serve.mjs`: an optional zero-dependency local server

The next step to make it a real product is splitting this into components (for example React) and connecting it to a backend for projects, tasks, people and spend.
