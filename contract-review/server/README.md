# Contract Review Wise — review server

Cloudflare Worker that runs the **Claude deep review** for clients without exposing your Anthropic API key.

- The API key is a Worker secret; browsers never see it.
- Clients use an **access code** you issue (only its SHA-256 is stored). Codes can carry a monthly review limit, be disabled, or be rotated.
- The prompt is built on the server from `../ai-spec.js`; callers send only contract text, playbook, side and model, so the endpoint is not a general Claude proxy.
- Every review is logged to **D1** (tokens, estimated cost, status) for billing. Admin console: `../admin.html`.

## API
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | — | Liveness |
| GET | `/api/me` | access code | Client name and this month's usage |
| POST | `/api/review` | access code | Run a review. Streams NDJSON: `start`, `progress`, then `result` or `error` |
| GET | `/api/admin/clients` | admin token | Clients with this month's reviews / cost |
| POST | `/api/admin/clients` | admin token | Create client `{name, monthly_reviews}` → returns the code once |
| POST | `/api/admin/clients/:id` | admin token | Update `{name?, active?, monthly_reviews?}` |
| POST | `/api/admin/clients/:id/rotate` | admin token | Issue a new code (old one stops working) |
| GET | `/api/admin/usage?month=YYYY-MM[&format=csv]` | admin token | Usage log |

Auth is `Authorization: Bearer <code or token>`.

## Deploy (about 10 minutes)
Requires Node.js 20+ and a free Cloudflare account.

```bash
cd contract-review/server
npm install
npx wrangler login
npx wrangler d1 create crw-usage          # copy the database_id it prints into wrangler.toml
npm run db:init                            # creates the tables
npx wrangler secret put ANTHROPIC_API_KEY  # paste your Anthropic API key
npx wrangler secret put ADMIN_TOKEN        # paste a long random string (e.g. `openssl rand -base64 32`)
npm run deploy                             # prints https://contract-review-wise.<subdomain>.workers.dev
```

Then:
1. Put that URL in `contract-review/config.js` (`apiBase`) and push, so the app shows **Service** mode.
2. If the app is not served from `https://tju2009g.github.io`, set `ALLOWED_ORIGINS` in `wrangler.toml` and redeploy.
3. Open `admin.html`, enter the URL and admin token, and create an access code per client.

## Local testing
```bash
npm test                         # unit tests (D1 emulated with node:sqlite, Claude faked)
node test/local-server.mjs       # API on http://localhost:8787, fake Claude, admin token "local-admin"
ANTHROPIC_API_KEY=... node test/local-server.mjs   # same, calling the real Claude API
```

## Notes
- Costs in the log are estimates from list prices in `src/pricing.js`; reconcile with your Anthropic invoice. If a refused request is completed by a fallback model, it is priced at that model's rate.
- Failed reviews are logged but do not count toward a client's monthly limit.
- Contract text is sent to Anthropic for processing and is not stored by this server; the log keeps the document name only.
