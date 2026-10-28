# StarSwarm SGI Security Network

Native merge of offline Analyze (**Paste Guard** Safe/Suspicious/Dangerous), Threat Index, Defender Hive, Quantum Helium Maps (+ liquidation dock), **Swarm Pass**, **Bounty board**, **Redeem** (Coming soon), and **Honest Shield** (VPN + Protect) under one cover-map shell.

**Live:** https://starswarm-sgi.pages.dev/ · https://sgi.starswarm.workers.dev/

Parent brand: StarSwarm Agentic Security. Cover art + Orbitron/Archivo Black (OFL).

## Home (v8)

Interactive cover map with always-on hotspot labels. Header is Home + More (overflow for the other decks). Vault hotspot shrunk so it no longer covers the map. Mobile list fallback. Cover art + dog spotlight. Live on starswarm-sgi.pages.dev.

## Tabs

Home · Analyze (+ Paste Guard) · Threat Index · Hive · Quantum Helium · **Swarm Pass** · **Bounty** · **Redeem** · **Honest Shield**

### Paste Guard (Phase 0)
Offline rules in Analyze → Paste Guard mode. Verdicts: Safe / Suspicious / Dangerous. Paste never leaves the device. Heuristic only.

### Honest Shield
Merged free VPN desk + malware/spyware link-outs. Affiliate slots stay placeholders until you sign up.

### Swarm Pass (Phase 0)
Local badges, streaks, Swarm Credits in `localStorage`. Tour + daily check-in. **No install-only rewards.** Legal footer on the tab.

### Bounty board (Phase 0 demo)
Sample seasons/handles/scores. USDC/XMR payout toggles grayed **Coming soon**. Swarm Credits only now.

### Redeem (UI only)
Redeem SC for **XMR / SOL / ETH / BTC** gift cards — Coming soon / needs partner + Terms. Fold-style BTC gift cards noted as an example partner path. **No real redemptions, wallets, or transfers.** Future crypto gift-card redeem may need KYC.

## Local

```bash
python3 -m http.server 8000
```

Open http://localhost:8000. No trackers. No invented live numbers.

The static site does not call the API. Paste Guard and Analyze still run in the browser. Swarm Pass and Redeem still use the localStorage ledger.

## API skeleton (Workers + D1)

Phase 1 backend lives in `worker/` and is not deployed. Config is `worker/wrangler.jsonc` (the current Wrangler format; same role as a wrangler.toml). The Worker name is `sgi-api`. It has no routes, `workers_dev` is false, and preview URLs are off, so it cannot replace https://starswarm-sgi.pages.dev/ or https://sgi.starswarm.workers.dev/.

Do not run `wrangler deploy`, `wrangler d1 create`, or `wrangler d1 migrations apply --remote`. There is no deploy script.

```bash
cd worker
npm install
npm run typecheck
npm run migrate:local
npm test
npm run dev
```

`npm run dev` serves the API locally (Wrangler’s default is http://127.0.0.1:8787) against a local D1 database. `migrate:local` applies `worker/migrations/`. The `database_id` in config is a placeholder, not a live database. `npm run bundle:dry-run` only bundles; it does not upload. `npm test` may warn that `.dev.vars` is missing; the Vitest config injects a fake webhook secret and does not call RevenueCat.

Copy `worker/.dev.vars.example` to `worker/.dev.vars` for local secrets. Never commit `.dev.vars`. Set real values later with `wrangler secret put` (not in git):

- `REVENUECAT_WEBHOOK_SECRET` — required before the webhook accepts events. Unsigned requests are rejected. RevenueCat’s static Authorization header should be this same value. `X-RevenueCat-Signature` may instead be hex HMAC-SHA256 of the raw body.
- `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` — Sign in with Apple placeholders. The route stays a 501 stub and does not call Apple.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google sign-in placeholders. The route stays a 501 stub and does not call Google.

`ENABLE_LLM` defaults to `0`. Setting it to `1` still does not call a model.

CORS allows `https://starswarm-sgi.pages.dev`, `https://sgi.starswarm.workers.dev`, and local `localhost` / `127.0.0.1` ports 8000 and 8787. Other origins are refused.

Skeleton routes:

- `POST /v1/auth/device` — anonymous device. Session tokens are stored as hashes. The first session starts a 3-day Pro trial (same daily analyze limit as the paid plans) and also keeps a free entitlement with no expiry. After the trial timestamp passes, the active plan falls back to free. The trial is not a charge.
- `GET /v1/auth/providers`, `POST /v1/auth/apple`, `POST /v1/auth/google`
- `POST /v1/analyze` — entitlements, per-tier daily limit, D1 cache by content hash. Uses `js/analyzers.js` and `js/paste-guard.js`.
- `POST /v1/webhooks/revenuecat` — signature check, then entitlement upsert. App user id must be this API’s user UUID, not an email.
- `GET` / `PUT /v1/swarm-pass` — optional sync. Browser localStorage stays the Phase 0 ledger.
- `POST /v1/redeem/codes` — one-time promo codes. `POST /v1/redeem/gift-card` is 501 (no wallets or transfers).
- `POST /v1/breach/check`, `GET /v1/breach/status`, `POST /v1/scan/external` — placeholders only. Domain-ownership verification comes before any real lookup.
- `POST /v1/support/chat` and `GET /v1/support/faq` — corner support chat. `SupportChat` is an `AIChatAgent` at `/agents/support-chat/:id`. With `ENABLE_SUPPORT_LLM` at `0` (the default) both the HTTP route and the agent answer from `data/support-faq.json` only. This Wrangler has no local Workers AI simulator, so the `ai` binding is not in `wrangler.jsonc` (it would open a remote session). After a spend yes, add `"ai": { "binding": "AI", "remote": true }` and set `ENABLE_SUPPORT_LLM` to `1`. That calls `@cf/zai-org/glm-4.7-flash` with the FAQ as the system prompt and spends Workers AI quota. Until then a missing binding stays on the FAQ.

The static site loads `js/support-chat.js`. The launcher sits in the corner and stays closed until opened, so castle hotspots stay clickable. It reads the FAQ from `data/support-faq.json` on the page. Set `window.SGI_API_BASE` (for example `http://127.0.0.1:8787`) before the script if you want it to call the worker. If that base is missing or the request fails, the widget stays on the on-device FAQ and says support is offline. Do not paste passwords or keys into the chat. The only human link is the GitHub Sponsors URL already in the header. This site does not publish an X or Telegram handle.

Catalog placeholders (this API does not charge):

| Plan | Price | RevenueCat product id (not live) |
| --- | --- | --- |
| Pro trial | 3 days, then free | `sgi.trial.3d` |
| Monthly | $9.99 / month | `sgi.monthly.999` |
| Yearly special | $39.99 / year | `sgi.yearly.special_3999` |
| Free | $0, no expiry | none |

The trial starts on the first anonymous device session. Free remains on the account and is what analyze uses after those 3 days. Monthly and yearly replace the trial while they are active and use the same Pro analyze limit.

## License

MIT for this shell. Fonts: OFL (Orbitron, Archivo Black, Sora, Inter).
