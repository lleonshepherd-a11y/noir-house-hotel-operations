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

Open http://localhost:5173. The first person to open it sets up the workspace and becomes the CEO, using the setup code printed in the terminal. The app starts with sample data so you can see how it works.

To look at the app on its own, without accounts or saving to a server, open `index.html` in a browser or run `npm run demo`.

## Deploy on Railway

1. In Railway, choose **New Project → Deploy from GitHub repo** and pick `noir-house-hotel-operations`.
2. In the service's **Settings**:
   - **Source → Branch:** `claude/nice-euler-o5jz2b`
   - **Source → Root Directory:** `/helm-frontend`
3. Add a **Volume** to the service and mount it at `/data`. This is where the database and uploaded files live. Without a volume, everything is wiped on each deploy.
4. In **Variables**, add `DATA_DIR=/data`, `HELM_SECRET` set to a long random string, and `SETUP_CODE` set to a code only you know (you type it once when you set up your account). Helm uses `HELM_SECRET` to encrypt connection tokens. If you change it later, you'll need to connect each tool again.
5. Under **Networking**, click **Generate Domain**, then open that address and set up your account.

Railway runs `npm start`. The health check is `/health`.

## What the backend does

| Area | How it works |
| --- | --- |
| Accounts | **Continue with Google**, **Continue with email** (email and password) or **Sign in with a passkey** (Face ID, a fingerprint or a security key; add one in Settings → **Passkeys**). The sign-in page puts the way you used last time first. Google sign-in uses the same Google app as Gmail and Calendar (shown once its keys are added) and only lets in people who already have an account or an invite for that email. Passwords are stored as scrypt hashes. Sessions use a secure, HTTP-only cookie that lasts 30 days; expired sessions are deleted. Login is limited to 10 tries per 15 minutes for each address and for each email, and gives the same answer whether or not an email has an account. |
| Getting back in | **Remembered devices:** a device you've signed in on before is never locked out by someone else's wrong guesses. **Forgot password?** on the sign-in page lets the CEO and managers know you need help. They press **Sign-in link** (Settings → Members, or on the notice) and send you a link that works once, for an hour, and signs out your other devices. Managers can send links to Members and Guests; the CEO to anyone. The CEO recovers their own account with the `SETUP_CODE` variable. **New sign-ins** from another device show on your other devices with a **Not me** button. If you're locked out, the sign-in page says when you can try again. Show-password and Caps Lock warnings help avoid typos. |
| First run | The first person creates the workspace and becomes the CEO. They need the setup code: `SETUP_CODE` if you set it, otherwise the one printed in the server log. Once the workspace exists, setup is closed for good. |
| Inviting people | Settings → Members & permissions → **Invite** (for someone already on the team list) or **Invite people** (for someone new). Helm makes a one-time link to send them. They choose a password and they're in. Links stop working after 7 days; press **New link** to send another. |
| Removing people | Settings → Members & permissions. **Sign out** ends someone's sessions on every device. **Remove** deletes their account so they can't sign in again; their name stays on their past work and open tasks until you reassign them. Anyone can use **Sign out everywhere** for their own account. |
| Roles | Everyone has a **job role**: CEO, CTO, Finance, Marketing, Engineering, Manager, Member or Guest, and the CEO can add more (Settings → Members & permissions → **+ Add role**). Each role has a level, which decides what it can change (Manager, Member or View only), and a set of areas it sees, ticked in the **What each role can see** grid. The server enforces it: an area that isn't ticked is never sent to that person, and changes to it are refused. Out of the box, Finance sees money, wages, fundraising and legal; the CTO sees projects, metrics and decisions; Marketing sees projects, metrics and announcements; Engineering sees tasks, projects and notes. Connections and Settings stay with the CEO. Use **Preview** next to a person to see Helm exactly as they do. |
| Wages | Based on role, with no PIN. The CEO always sees wages. The CEO can give access to Managers from Wages → **Access**, and those Managers can view wages but not change them. Members and Guests never can. Wages are never sent with the rest of the data, and the server checks access on every request. |
| Saving | Every change is saved to a SQLite database on the server, so the whole team sees the same data. If someone else changed the same thing while you were editing, Helm asks which version to keep. Each part has a size limit; messages can be up to 4,000 characters, and each space or chat keeps its latest 2,000 messages. |
| Messages | Spaces and direct messages are stored on the server. People only receive the spaces they're in and their own direct messages, and can only post as themselves. New messages reach everyone straight away. |
| Live updates | When someone changes something, everyone else's screen updates within a second. |
| Files | Uploads (space files, contract and minutes PDFs, data room documents) are stored on the server, up to 25 MB each, 5 GB for the workspace and 1 GB for each person (change these with `FILES_QUOTA_MB` and `FILES_PER_PERSON_MB`). Each file is only available to roles allowed to see that area. |
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
| 5 days late | It goes to the CEO: a "Blocked" card on the Briefing and a notification. |
| Done | The next person, and anyone whose task was waiting on it, is told it's their turn. |

Each project page has a **Held up** panel. It shows what's late, who has it, how long it's been, and which milestone it puts at risk, with **Chase** and **Reassign** buttons. Chase sends the owner a direct message. A project's health (on track, at risk or off track) is worked out from its late tasks.

## Connections

The CEO connects tools on the **Connections** page. Helm only reads from them. Helm checks each tool again every 30 minutes, and you can press **Sync now** at any time. Tokens are stored encrypted, and only the CEO's browser receives what Helm reads.

| Tool | What it fills in | What you need |
| --- | --- | --- |
| Gmail | Your unread count and latest emails, shown under Inbox on the Briefing | A Google app (see below) |
| Google Calendar | Your meetings on the Helm calendar, from last week to 60 days ahead. The team doesn't see them. | The same Google app |
| Google Drive | Your recently changed files | The same Google app |
| QuickBooks | Bank account balances in Money | An Intuit app |
| Xero | Bank account balances in Money, from the Bank Summary report | A Xero app |
| Business bank account | Balances, through Plaid | Plaid keys |
| Stripe | MRR (monthly recurring revenue) in Money and Metrics | A restricted key with Read access to Subscriptions and Prices. Paste it on the page. |

**Setting up an app (Google, QuickBooks, Xero, Plaid).** Each service needs its own app for your Helm, which you set up once:

1. Open the tool on the Connections page and press **Set up**. The window links to the right developer console and shows the redirect URL to copy, for example `https://your-app.up.railway.app/api/connect/callback/google`.
2. In that console, create the app (for Google, an OAuth client of type *Web application*; also turn on the Gmail, Calendar and Drive APIs) and add the redirect URL.
3. Paste the Client ID and Secret into Helm. Or set them as Railway variables instead: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, `QUICKBOOKS_CLIENT_ID` and `QUICKBOOKS_CLIENT_SECRET`, `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET`, or `PLAID_CLIENT_ID`, `PLAID_SECRET` and `PLAID_ENV` (`sandbox` or `production`).
4. Press **Connect** and sign in.

A Google app starts in *Testing* mode: add your own email as a test user in Google Cloud. Gmail is a restricted scope, so letting people outside your company use it needs Google's verification. For your own inbox, testing mode is enough. If Railway sits behind a custom domain, set `PUBLIC_URL` to that address so the redirect URLs and invite links use it.

Gusto, GitHub, Figma and Carta show as *Coming soon*.

## Not built yet

- **More connections.** Gusto payroll, GitHub, Figma and Carta.
- **Email.** Invite links are shown to the CEO to send themselves, and notifications appear in the app. Sending emails needs an email service such as Resend or Postmark.
- **Sign-in codes by email.** Signing in with a code sent by email needs an email service such as Resend or Postmark.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The app |
| `server.mjs` | The backend |
| `connectors.mjs` | Connections: Google, QuickBooks, Xero, Plaid and Stripe, and Google sign-in |
| `passkeys.mjs` | Passkey sign-in (WebAuthn), checked with Node's built-in crypto |
| `login.html` | Sign in (Google, email, passkey), first-run setup, joining from an invite, can't sign in, and sign-in links |
| `serve.mjs` | A simple server for the demo only (no accounts) |
| `SEED_FOUNDER_NEEDS.md` | What a seed-stage company needs from Helm |
