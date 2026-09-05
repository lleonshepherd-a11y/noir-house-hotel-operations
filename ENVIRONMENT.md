# Environment variables and cloud bindings

## Required production bindings

| Name | Type | Purpose |
| --- | --- | --- |
| `DB` | Cloudflare D1 binding | Permanent operational records and audit history |
| `FILES` | Cloudflare R2 binding | Photos, PDFs, voice notes, and other attachments |

These are bindings, not API keys. They are declared in `.openai/hosting.json` and connected by the hosting platform. For a direct Cloudflare deployment, bind `FILES` to the `hotel-files` bucket and bind `DB` to the chosen D1 database in the Worker configuration.

## Optional browser environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` | No | Public VAPID key used by the browser to create push subscriptions |
| `VITE_WEB_PUSH_SUBSCRIBE_URL` | No | HTTPS server endpoint that receives and stores push subscriptions |

The public VAPID key is safe for browser code. The corresponding private VAPID key must remain server-side and is not currently used by this project.

## Development-only variables

The build configuration may set `WRANGLER_WRITE_LOGS`, `WRANGLER_LOG_PATH`, and `MINIFLARE_REGISTRY_PATH` automatically for local tooling. You normally do not need to configure them.

## API keys

- No OpenAI API key is currently required.
- Do not add Cloudflare account IDs, R2 access key IDs, or R2 secret keys to browser-facing `VITE_` variables.
- If deploying through OpenAI Sites, configure D1 and R2 as platform bindings rather than storing raw Cloudflare credentials in the repository.
- If deploying outside Sites with an S3-compatible R2 client, keep `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` only in server-side secret storage. The current Worker-binding implementation does not need those three values.

