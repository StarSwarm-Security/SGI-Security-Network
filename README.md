# StarSwarm SGI Security Network

Native merge of offline Analyze (**Paste Guard** Safe/Suspicious/Dangerous), Threat Index, Defender Hive, **Swarm Pass**, **Bounty board**, **Redeem** (Coming soon), and **Honest Shield** (VPN + Protect) under one cover-map shell.

**Live:** https://starswarm-sgi.pages.dev/ · https://sgi.starswarm.workers.dev/

Parent brand: StarSwarm Agentic Security. Cover art + Orbitron/Archivo Black (OFL).

## Home (v8)

Interactive cover map. Clickable labels sit on the art and open that deck directly — no label popup. Header is Home + More (overflow for the other decks). Mobile uses the list. Cover art + dog spotlight. Live on starswarm-sgi.pages.dev.

## Tabs

Home · Analyze (+ Paste Guard) · Threat Index · Hive · **Swarm Pass** · **Bounty** · **Redeem** · **Honest Shield**

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

## Gate

The shell (castle map, tabs, Analyze, Paste Guard, Threat Index, Hive, Honest Shield, and the rest) stays behind a full-screen black abyss until the API accepts a session.

- Google Sign-In is first when a public client id is available from `GET /v1/auth/providers`, `window.SGI_GOOGLE_CLIENT_ID`, or `js/auth-config.js`. Do not commit a client secret.
- Anonymous fallback calls `POST /v1/auth/device` while that seal is offered, then confirms `GET /v1/me`.
- The bearer token is kept in this browser so a still-valid session skips the card. Apple stays hidden.
- Paste Guard still runs only on the device after the gate opens.

This repo does not deploy or publish the live hosts.

## Privacy and Terms

Standalone documents, not the app shell. After this tree is published, paste these into Google Branding (they return the policy with HTTP 200):

- https://starswarm-sgi.pages.dev/privacy
- https://starswarm-sgi.pages.dev/terms

`/privacy.html` and `/terms.html` are the same files. Pages redirects those `.html` URLs to the links above. Do not add a `_redirects` rule from `/privacy` back to `/privacy.html`; that loops. There is no path router in the castle app (tabs use a hash on `/`). A top-level `404.html` is what stops Cloudflare Pages from treating every unknown path as `index.html`. Do not delete `404.html` or replace the legal files with the app shell. This change does not deploy.

## Local

```bash
python3 -m http.server 8000
```

Open http://localhost:8000. The gate calls `https://sgi-api.starswarm.workers.dev` (that origin allows `http://localhost:8000`). No trackers. No invented live numbers.

The static site does not call the API. Paste Guard and Analyze still run in the browser. Swarm Pass and Redeem still use the localStorage ledger.

## API skeleton (Workers + D1)

Phase 1 backend lives in `worker/`. Config is `worker/wrangler.jsonc` (the current Wrangler format; same role as a wrangler.toml). The Worker name is `sgi-api`. It has no routes. `workers_dev` is true and preview URLs are off, so a deploy publishes only `sgi-api.<account>.workers.dev`. That does not replace https://starswarm-sgi.pages.dev/ or https://sgi.starswarm.workers.dev/.

Remote D1 migration `0001_init.sql` is already applied to database `sgi-api`. Do not run `wrangler d1 migrations apply --remote` again. From `worker/`, `npx wrangler deploy` publishes `sgi-api` only.

```bash
cd worker
npm install
npm run typecheck
npm run migrate:local
npm test
npm run dev
npx wrangler deploy
```

`npm run dev` serves the API locally (Wrangler’s default is http://127.0.0.1:8787) against a local D1 database. `migrate:local` applies `worker/migrations/` to that local database only.

The remote D1 database is `sgi-api`, id `9cb29592-5e30-4d4d-aecf-7aff7bf91a10`, jurisdiction `us`, and `0001_init.sql` is already recorded in `d1_migrations`. The Worker binding is still `DB`, with `remote: false`, so local dev does not talk to that database. Do not re-apply remote SQL. `npm run bundle:dry-run` only bundles; it does not upload. `npm test` may warn that `.dev.vars` is missing; the Vitest config injects a fake webhook secret and does not call RevenueCat. RevenueCat, Apple, and Google secrets are not required for deploy. If they are unset, Apple sign-in stays a 501 stub, Google sign-in returns 501 `not_configured`, and the webhook fails closed. This repo change does not deploy the Worker.

Copy `worker/.dev.vars.example` to `worker/.dev.vars` for local secrets. Never commit `.dev.vars`. Set real values later with `wrangler secret put` (not in git):

- `REVENUECAT_WEBHOOK_SECRET` — required before the webhook accepts events. Unsigned requests are rejected. RevenueCat’s static Authorization header should be this same value. `X-RevenueCat-Signature` may instead be hex HMAC-SHA256 of the raw body.
- `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` — Sign in with Apple placeholders. The route stays a 501 stub and does not call Apple.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google sign-in. `GET /v1/auth/providers` reports `google: true` only when both are non-empty. `GOOGLE_CLIENT_SECRET` is reserved for a future authorization-code exchange and is not used to verify ID tokens. Verification uses `GOOGLE_CLIENT_ID` as the token `aud`. Do not commit either value.

`ENABLE_LLM` defaults to `0`. Setting it to `1` still does not call a model.

CORS allows `https://starswarm-sgi.pages.dev`, `https://sgi.starswarm.workers.dev`, and local `localhost` / `127.0.0.1` ports 8000 and 8787. Other origins are refused.

Skeleton routes:

- `POST /v1/auth/device` — anonymous device. Session tokens are stored as hashes. The first session starts a 3-day Pro trial (same daily analyze limit as the paid plans) and also keeps a free entitlement with no expiry. After the trial timestamp passes, the active plan falls back to free. The trial is not a charge.
- `GET /v1/auth/providers` — anonymous is always on. Apple is on only when every Apple secret is set (the route is still a stub). Google is on only when both Google secrets are set.
- `POST /v1/auth/apple` — still a 501 stub. It does not call Apple.
- `POST /v1/auth/google` — body `{ "id_token": "..." }` or `{ "credential": "..." }` (GIS button alias). Until both Google secrets are set, the response is 501 `not_configured` with the missing names. After that, the Worker fetches Google's JWKS (`https://www.googleapis.com/oauth2/v3/certs`, cached in the isolate for at most 10 minutes), checks the RS256 signature with Web Crypto, and requires `iss` of `accounts.google.com` or `https://accounts.google.com`, `aud` equal to `GOOGLE_CLIENT_ID`, a current `exp` (60 second skew), and `email_verified` when an email claim is present. A bad token is 401 `invalid_id_token`. An expired token is 401 `expired_id_token`. The raw ID token is not stored or logged. The Google `sub` is stored as `users.provider_subject` so a repeat sign-in returns a new bearer session for the same user. The first sign-in creates the same free and trial entitlements as an anonymous device. CORS matches the other routes. Analyze rate limits stay per device and UTC day on that session. Optional `deviceId` reuses or creates a device for this user and does not take over another user's device.
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

The trial starts on the first anonymous device session or the first Google sign-in for a subject. Free remains on the account and is what analyze uses after those 3 days. A repeat Google sign-in does not start another trial. Monthly and yearly replace the trial while they are active and use the same Pro analyze limit.

## License

MIT for this shell. Fonts: OFL (Orbitron, Archivo Black, Sora, Inter).
