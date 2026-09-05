# Noir House Hotel Operations

Noir House is a premium hotel communications and accountability dashboard. The current project includes the responsive dashboard, department messaging interface, guest requests, tasks, handovers, department pinboards, calendar/planner, management oversight views, and the server-side foundation for permanent records and audit events.

## Requirements

- Node.js 22.13 or newer
- npm
- A Cloudflare account for a production deployment
- Cloudflare D1 for structured records
- Cloudflare R2 for photos, PDFs, voice notes, and other files

## Local setup

1. Extract the ZIP and open a terminal in the project folder.
2. Install the dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env.local` if you want to configure optional browser push notifications.
4. Start the development site:

   ```bash
   npm run dev
   ```

5. Open the local address printed in the terminal.

## Build and validation

Create the production build:

```bash
npm run build
```

Run the code checks:

```bash
npm run lint
```

Run the production Worker locally after building:

```bash
npm run start
```

## Cloud resources

The application expects these Cloudflare bindings:

- `DB`: a D1 database for messages, tasks, receipts, sessions, pins, handovers, announcements, management decisions, and audit events.
- `FILES`: an R2 bucket for uploaded photographs, PDFs, and voice recordings.

They are declared in `.openai/hosting.json`. The logical binding `FILES` must be connected to the intended production bucket (for example, `hotel-files`) in the hosting environment. Do not put an R2 access key or secret key in frontend code.

Database migrations are in `drizzle/` and must be applied in numerical order when provisioning a new database.

## Environment configuration

See [ENVIRONMENT.md](ENVIRONMENT.md) and `.env.example`. The current code does not require an OpenAI API key. Web-push values are optional until a push subscription service is connected.

## Important production status

The visual dashboard is deployable, and the repository contains the backend data model and API foundation. Before using it for real hotel operations, finish and verify production authentication, database and R2 provisioning, permission enforcement, notification delivery, retention automation, recovery procedures, and end-to-end security testing.

## Project structure

- `app/` — pages, styling, and API routes
- `lib/backend/` — sessions, permissions, audit, policy, and runtime bindings
- `db/` — database schema bootstrap
- `drizzle/` — D1 migrations
- `components/` — reusable interface components
- `public/` — public assets and service worker
- `.openai/hosting.json` — Sites/Cloudflare resource declarations

