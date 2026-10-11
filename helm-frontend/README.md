# Helm: founder console

Helm shows a founder their whole company in one place: what needs them today, projects and tasks, the team, money, wages, fundraising, board and legal, messages and spaces.

It has two parts in this folder:

- `index.html`: the app the team uses.
- `server.mjs`: the backend. It handles accounts, roles, the database, file storage and live updates. It needs no extra packages, only Node.js 22.13 or newer.

## Run it on your computer

```bash
cd helm-frontend
npm start
```

Open http://localhost:5173. The first person to open it sets up the workspace and becomes the CEO. The app starts with sample data so you can see how it works.

To look at the app on its own, without accounts or saving to a server, open `index.html` in a browser or run `npm run demo`.

## Deploy on Railway

1. In Railway, choose **New Project → Deploy from GitHub repo** and pick `noir-house-hotel-operations`.
2. In the service's **Settings**:
   - **Source → Branch:** `claude/nice-euler-o5jz2b`
   - **Source → Root Directory:** `/helm-frontend`
3. Add a **Volume** to the service and mount it at `/data`. This is where the database and uploaded files live. Without a volume, everything is wiped on each deploy.
4. In **Variables**, add `DATA_DIR=/data`.
5. Under **Networking**, click **Generate Domain**, then open that address and set up your account.

Railway runs `npm start`. The health check is `/health`.

## What the backend does

| Area | How it works |
| --- | --- |
| Accounts | Email and password. Passwords are stored as scrypt hashes. Sessions use a secure, HTTP-only cookie that lasts 30 days. Login is rate-limited to 10 tries per 15 minutes. |
| First run | The first person creates the workspace and becomes the CEO. |
| Inviting people | Settings → Members & permissions → **Invite** (for someone already on the team list) or **Invite people** (for someone new). Helm makes a one-time link to send them. They choose a password and they're in. |
| Roles | CEO, Manager, Member and Guest. Roles are checked on the server: a Member's browser is never sent money, wages, fundraising, board and legal, connections or decisions data, and the server refuses any change to those areas. Changing someone's role in Settings updates their account. |
| Wages | Never sent with the rest of the data. Wages open only after the server checks the 4-digit PIN, and only for the CEO and the people given access. The PIN is stored hashed. The first PIN is 1234; change it from the Wages page. |
| Saving | Every change is saved to a SQLite database on the server, so the whole team sees the same data. |
| Messages | Spaces and direct messages are stored on the server. People only receive the spaces they're in and their own direct messages, and can only post as themselves. New messages reach everyone straight away. |
| Live updates | When someone changes something, everyone else's screen updates within a second. |
| Files | Uploads (space files, contract and minutes PDFs, data room documents) are stored on the server, up to 25 MB each. Each file is only available to roles allowed to see that area. |
| Audit log | Every change, upload, invite and wages access is recorded with who did it and when. |
| Security | Changes need a custom request header, which blocks cross-site form posts. Uploaded files are served with a sandbox policy, and only safe file types open in the browser. |

## Not built yet

- **Real connections.** The bank, Stripe, payroll, Google Calendar and Slack each need an account and API keys from that company. The server already reports which keys are set (for example `STRIPE_SECRET_KEY`); pulling their data in is the next step.
- **Email.** Invite links are shown to the CEO to send themselves, and notifications appear in the app. Sending emails needs an email service such as Resend or Postmark.
- **Password reset by email.** For now the CEO can send a new invite.
- **Editing at the same moment.** If two people edit the same area at once, the last save wins. Messages are merged safely.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The app |
| `server.mjs` | The backend |
| `login.html` | The sign-in, first-run setup and join-from-invite page |
| `serve.mjs` | A simple server for the demo only (no accounts) |
| `SEED_FOUNDER_NEEDS.md` | What a seed-stage company needs from Helm |
