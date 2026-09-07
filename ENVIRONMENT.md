# Environment variables and cloud bindings

## Required production bindings

| Name | Type | Purpose |
| --- | --- | --- |
| `DB` | Cloudflare D1 binding | Permanent operational records and audit history |
| `FILES` | Cloudflare R2 binding | Photos, PDFs, voice notes, and other attachments |

These are bindings, not API keys. They are declared in `wrangler.json` at the project root — see "Deploying to your own Cloudflare account" in [README.md](README.md) for how to create the D1 database and R2 bucket and connect them.

## Optional browser environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` | No | Public VAPID key used by the browser to create push subscriptions |
| `VITE_WEB_PUSH_SUBSCRIBE_URL` | No | HTTPS server endpoint that receives and stores push subscriptions |

The public VAPID key is safe for browser code. The corresponding private VAPID key must remain server-side and is not currently used by this project.

## Development-only variables

The build configuration may set `WRANGLER_WRITE_LOGS`, `WRANGLER_LOG_PATH`, and `MINIFLARE_REGISTRY_PATH` automatically for local tooling. You normally do not need to configure them.

## API keys

- No OpenAI API key is required by this project.
- Do not add Cloudflare account IDs, R2 access key IDs, or R2 secret keys to browser-facing `VITE_` variables.
- D1 and R2 are configured as Worker bindings in `wrangler.json`, not raw credentials — nothing Cloudflare-secret needs to live in the repository.
- If you ever access R2 through an S3-compatible client instead of the Worker binding, keep `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` only in server-side secret storage. The current Worker-binding implementation does not need those three values.

