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

The application expects these Cloudflare bindings, declared in `wrangler.json` at the project root:

- `DB`: a D1 database for messages, tasks, receipts, sessions, pins, handovers, announcements, management decisions, and audit events.
- `FILES`: an R2 bucket for uploaded photographs, PDFs, and voice recordings.

Do not put an R2 access key or secret key in frontend code.

Database migrations are in `drizzle/` and must be applied in numerical order when provisioning a new database.

## Deploying to your own Cloudflare account

This project deploys as a standard Cloudflare Worker, entirely through the `wrangler` CLI and your own Cloudflare account — no third-party hosting service is involved.

1. Log in to your Cloudflare account from the terminal:

   ```bash
   npx wrangler login
   ```

2. Create your own D1 database and R2 bucket (one-time setup):

   ```bash
   npx wrangler d1 create noir-house-db
   npx wrangler r2 bucket create noir-house-files
   ```

   The `d1 create` command prints a `database_id`. Copy it into `wrangler.json`, replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`. If you name your D1 database or R2 bucket something other than `noir-house-db` / `noir-house-files`, update `database_name` / `bucket_name` in `wrangler.json` to match.

3. Apply the database schema to your new D1 database, running each file in `drizzle/` in order:

   ```bash
   npx wrangler d1 execute noir-house-db --remote --file=drizzle/0001_accountability_foundation.sql
   npx wrangler d1 execute noir-house-db --remote --file=drizzle/0002_management_oversight.sql
   npx wrangler d1 execute noir-house-db --remote --file=drizzle/0003_status_boards.sql
   npx wrangler d1 execute noir-house-db --remote --file=drizzle/0004_reliable_delivery.sql
   ```

   (If later migrations are added, run those too, in numerical order.)

4. Build and deploy:

   ```bash
   npm run deploy
   ```

   This builds the app and runs `wrangler deploy` against the config in `wrangler.json`. Wrangler prints the live `*.workers.dev` URL when it finishes.

To publish a future change, repeat step 4 — `npm run deploy` always builds fresh from the current code and pushes it live.

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
- `wrangler.json` — Cloudflare Worker config (bindings, D1 database, R2 bucket)

