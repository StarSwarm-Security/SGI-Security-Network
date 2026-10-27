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

- `POST /v1/auth/device` — anonymous free-tier device. Session tokens are stored as hashes.
- `GET /v1/auth/providers`, `POST /v1/auth/apple`, `POST /v1/auth/google`
- `POST /v1/analyze` — entitlements, per-tier daily limit, D1 cache by content hash. Uses `js/analyzers.js` and `js/paste-guard.js`.
- `POST /v1/webhooks/revenuecat` — signature check, then entitlement upsert. App user id must be this API’s user UUID, not an email.
- `GET` / `PUT /v1/swarm-pass` — optional sync. Browser localStorage stays the Phase 0 ledger.
- `POST /v1/redeem/codes` — one-time promo codes. `POST /v1/redeem/gift-card` is 501 (no wallets or transfers).
- `POST /v1/breach/check`, `GET /v1/breach/status`, `POST /v1/scan/external` — placeholders only. Domain-ownership verification comes before any real lookup.

Catalog placeholders: free, monthly $1.00 and $9.00, yearly special $49.99. This API does not charge.

## License

MIT for this shell. Fonts: OFL (Orbitron, Archivo Black, Sora, Inter).
