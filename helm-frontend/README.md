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
4. In **Variables**, add `DATA_DIR=/data` and `HELM_SECRET` set to a long random string. Helm uses `HELM_SECRET` to encrypt connection tokens. If you change it later, you'll need to connect each tool again.
5. Under **Networking**, click **Generate Domain**, then open that address and set up your account.

Railway runs `npm start`. The health check is `/health`.

## What the backend does

| Area | How it works |
| --- | --- |
| Accounts | Email and password. Passwords are stored as scrypt hashes. Sessions use a secure, HTTP-only cookie that lasts 30 days. Login is rate-limited to 10 tries per 15 minutes. |
| First run | The first person creates the workspace and becomes the CEO. |
| Inviting people | Settings → Members & permissions → **Invite** (for someone already on the team list) or **Invite people** (for someone new). Helm makes a one-time link to send them. They choose a password and they're in. |
| Roles | CEO, Manager, Member and Guest. Roles are checked on the server: a Member's browser is never sent money, wages, fundraising, board and legal, connections or decisions data, and the server refuses any change to those areas. Changing someone's role in Settings updates their account. |
| Wages | Based on role, with no PIN. The CEO always sees wages. The CEO can give access to Managers from Wages → **Access**, and those Managers can view wages but not change them. Members and Guests never can. Wages are never sent with the rest of the data, and the server checks access on every request. |
| Saving | Every change is saved to a SQLite database on the server, so the whole team sees the same data. |
| Messages | Spaces and direct messages are stored on the server. People only receive the spaces they're in and their own direct messages, and can only post as themselves. New messages reach everyone straight away. |
| Live updates | When someone changes something, everyone else's screen updates within a second. |
| Files | Uploads (space files, contract and minutes PDFs, data room documents) are stored on the server, up to 25 MB each. Each file is only available to roles allowed to see that area. |
| Audit log | Every change, upload, invite and wages access is recorded with who did it and when. |
| Security | Changes need a custom request header, which blocks cross-site form posts. Uploaded files are served with a sandbox policy, and only safe file types open in the browser. |

## Accountability

Every task has one owner, who is accountable for it, plus a due date. Open any task to change these, or to set two optional links:

- **Waits for:** another task that has to finish first.
- **When done, hand to:** the person who takes over next.

Helm then follows each task through:

| When | What happens |
| --- | --- |
| Due today or tomorrow | The owner gets a reminder. |
| 1 day late | The owner is nudged to update it or say what's in the way. |
| 2 days late, or no movement for 5 days | The project lead is told. |
| 5 days late | It goes to the CEO: a "Blocked" card on the Briefing, a notification, and a Slack post if Slack is connected (checked hourly on the server). |
| Done | The next person, and anyone whose task was waiting on it, is told it's their turn. |

Each project page has a **Held up** panel. It shows what's late, who has it, how long it's been, and which milestone it puts at risk, with **Chase** and **Reassign** buttons. Chase sends the owner a direct message. A project's health (on track, at risk or off track) is worked out from its late tasks.

## Connections

The CEO connects tools on the **Connections** page. Helm only reads from them. The one exception is Slack: Helm posts new announcements to the channel you choose. Helm checks each tool again every 30 minutes, and you can press **Sync now** at any time. Tokens are stored encrypted, and only the CEO's browser receives what Helm reads.

| Tool | What it fills in | What you need |
| --- | --- | --- |
| Gmail | Your unread count and latest emails, shown under Inbox on the Briefing | A Google app (see below) |
| Google Calendar | Your meetings on the Helm calendar, from last week to 60 days ahead. The team doesn't see them. | The same Google app |
| Google Drive | Your recently changed files | The same Google app |
| QuickBooks | Bank account balances in Money | An Intuit app |
| Xero | Bank account balances in Money, from the Bank Summary report | A Xero app |
| Business bank account | Balances, through Plaid | Plaid keys |
| Stripe | MRR (monthly recurring revenue) in Money and Metrics | A restricted key with Read access to Subscriptions and Prices. Paste it on the page. |
| Slack | Posts new announcements to a channel | An incoming webhook URL. Paste it on the page. |

**Setting up an app (Google, QuickBooks, Xero, Plaid).** Each service needs its own app for your Helm, which you set up once:

1. Open the tool on the Connections page and press **Set up**. The window links to the right developer console and shows the redirect URL to copy, for example `https://your-app.up.railway.app/api/connect/callback/google`.
2. In that console, create the app (for Google, an OAuth client of type *Web application*; also turn on the Gmail, Calendar and Drive APIs) and add the redirect URL.
3. Paste the Client ID and Secret into Helm. Or set them as Railway variables instead: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, `QUICKBOOKS_CLIENT_ID` and `QUICKBOOKS_CLIENT_SECRET`, `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET`, or `PLAID_CLIENT_ID`, `PLAID_SECRET` and `PLAID_ENV` (`sandbox` or `production`).
4. Press **Connect** and sign in.

A Google app starts in *Testing* mode: add your own email as a test user in Google Cloud. Gmail is a restricted scope, so letting people outside your company use it needs Google's verification. For your own inbox, testing mode is enough. If Railway sits behind a custom domain, set `PUBLIC_URL` to that address so the redirect URL matches.

Gusto, GitHub, Figma and Carta show as *Coming soon*.

## Not built yet

- **More connections.** Gusto payroll, GitHub, Figma and Carta.
- **Email.** Invite links are shown to the CEO to send themselves, and notifications appear in the app. Sending emails needs an email service such as Resend or Postmark.
- **Password reset by email.** For now the CEO can send a new invite.
- **Editing at the same moment.** If two people edit the same area at once, the last save wins. Messages are merged safely.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The app |
| `server.mjs` | The backend |
| `connectors.mjs` | Connections: Google, QuickBooks, Xero, Plaid, Stripe and Slack |
| `login.html` | The sign-in, first-run setup and join-from-invite page |
| `serve.mjs` | A simple server for the demo only (no accounts) |
| `SEED_FOUNDER_NEEDS.md` | What a seed-stage company needs from Helm |
