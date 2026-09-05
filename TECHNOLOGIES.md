# Technologies used

## Application

- TypeScript 5.9
- React 19
- Vinext (Next.js-compatible application framework)
- Vite 8
- Cloudflare Workers runtime

## Interface

- Custom responsive CSS and glass-panel design system
- Lucide React icons
- Shadcn and Base UI component foundations
- React Day Picker and date-fns for calendar features
- Recharts for chart-ready interface components

## Data and storage

- Cloudflare D1 (SQLite) for operational records and audit history
- Cloudflare R2 for photographs, PDFs, voice notes, and other attachments
- SQL migrations in `drizzle/`

## Development and deployment

- npm and `package-lock.json` for reproducible dependency installation
- Wrangler for local Cloudflare Worker execution
- OpenAI Sites Vite plugin for build and hosting integration
- Oxlint and Oxfmt for code quality and formatting

