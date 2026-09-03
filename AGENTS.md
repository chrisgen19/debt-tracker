<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Deployment

This project deploys to Coolify (self-hosted), not Vercel. Do not reach for the
Vercel CLI or create a Vercel project for it.

- The app is `debt-tracker` in the "Debt Tracker" project, production environment,
  served at https://debt.cgdev.site
- Build pack is this repo's `Dockerfile`. The container runs `prisma migrate deploy`
  and then `next start`.
- Coolify's own auto-deploy is switched OFF. Production is deployed only by the
  `deploy` job in `.github/workflows/ci.yml`, which runs on pushes to `main` after
  `verify` passes and POSTs to Coolify's API using the `COOLIFY_DEPLOY_WEBHOOK` and
  `COOLIFY_TOKEN` repository secrets. Merging a PR is what ships to production.
- `main` is protected by a ruleset: changes go through a PR and `verify` must pass.
  Never commit to `main` directly.
- The container healthcheck hits `/api/health`, which deliberately touches nothing
  but the web server so a database blip cannot restart a healthy container.
- The container sets `TZ=Asia/Manila`. Month boundaries on the dashboard are built
  from server local time, so the container timezone has to match the household's.
  A second household in another timezone would need this to become per-household
  data rather than a container-wide setting.
