# Architecture

Reviewed commit `0a55100e821ce45c820aedbd32448722b4c7a377` on `main`, clean worktree. No prior coverage ledger or findings file exists for this repo. Profile: standard. Live `sgi-api` and remote D1 were not called.

## Product and principals

StarSwarm SGI Security Network is a browser security desk plus a Workers API skeleton. Operators are the publisher. Users open the Pages shell (castle map, Analyze, Threat Index, Hive, Honest Shield, Swarm Pass, Bounty, Redeem, support chat).

Lower-trust principals:

- A visitor of the static page, before the gate.
- The author of text a user pastes into Analyze, Paste Guard, Agent Guard, or Config Auditor.
- An anonymous caller of `POST /v1/auth/device`, who receives a bearer and a 3-day trial by design.
- A Google ID-token presenter, checked locally as RS256.
- A RevenueCat webhook caller, accepted only with the shared secret or HMAC.
- A public support-chat caller. With `ENABLE_SUPPORT_LLM` at `0` and no AI binding, answers stay on the FAQ pack.
- Readers of the public swarm-alert feed.

Protected resources are the bearer session, entitlements, analyze quota, redeem grants, and swarm-pass rows. Swarm Credits in the browser are a local ledger with no cash value. Gift-card redeem is a 501 stub.

Comparable baseline, from this repo only: Google OIDC ID-token checks, RevenueCat webhooks, and public OSV / GitHub advisory feeds. Paste Guard is an on-device heuristic, not a gateway.

## Stack and deploy paths

The Pages site is static HTML, CSS, and ES modules. There is no root package build. `404.html` stops unknown paths from becoming `index.html`. `_redirects` has no rewrite rules.

`worker/wrangler.jsonc` selects `worker/src/index.ts` as `sgi-api`, with D1 binding `DB` (`remote: false` for local dev) and a `SupportChat` durable object. `ENABLE_LLM` and `ENABLE_SUPPORT_LLM` are `0`. No AI binding is declared.

`edge/sgi-worker-tail.js` is the static-file tail for a generated `sgi` / Pages worker that is not in this repo. It serves an in-memory `F` map and `GET /api/swarm-feed`.

Offline commands that exist: `python3 -m http.server` for the static tree, and `npm test` under `worker/` once dependencies are present. They were not installed here. `npx wrangler deploy` and remote D1 apply are prohibited for this run.

## Entry paths

Browser: `index.html` loads `js/gate.js`, which boots `app.js` only after `GET /v1/me` accepts a bearer (`js/gate.js`, `js/auth-client.js`). Cisco Analyze calls `runSwarm` in `js/analyzers.js` and writes `#analyze-out` with `innerHTML`. Other scan modes use `paintScan`, which calls `esc()`. Swarm alerts render through `renderAlertHtml`. Support bubbles use `textContent`.

Worker: `worker/src/index.ts` dispatches `/v1/*` and sends `/agents/*` to `routeAgentRequest` with no session check. Analyze, redeem, swarm-pass, and `/v1/me` use `requireSession`. Breach routes return 501. The webhook and device routes are unauthenticated by design, with the controls named above.

Edge: `handleSwarmFeed` fetches fixed GitHub and Socket URLs. `?package=` is posted to `https://api.osv.dev/v1/query` only after a package-name check. The cache key drops the query string.

## Trust boundaries

| Boundary | Strongest source-visible control |
| --- | --- |
| Cisco paste to DOM | None on that path. `esc()` exists and is used by the other scan modes. |
| Session bearer | SHA-256 at rest. Client copy is `localStorage` plus a non-HttpOnly cookie. |
| Google sign-in | Local RS256, fixed JWKS URL, `redirect: "error"`, audience and issuer checks. |
| Webhook | Fail closed without a secret. Timing-safe compare. Catalog tier only. |
| Analyze cache | Session required. Key is a hash of the caller's own text. |
| Redeem | Session user id. Distinct error strings after a failed claim. |
| CORS | Exact allowlist. Bearer is not an API cookie. |
| Support model | Flag must be `"1"` and `env.AI` must exist. Both are off in `wrangler.jsonc`. |
| Swarm feed fetch | Constant URLs plus a package-name predicate. |

## Starting paths

`index.html`, `app.js`, `js/analyzers.js`, `js/auth-client.js`, `js/gate.js`, `js/swarm-feed.js`, `js/support-chat.js`, `edge/swarm-feed.js`, `edge/sgi-worker-tail.js`, `worker/src/index.ts`, `worker/src/auth/`, `worker/src/analyze/handler.ts`, `worker/src/redeem/handler.ts`, `worker/src/webhooks/revenuecat.ts`, `worker/src/support/`, `worker/src/cors.ts`, `worker/wrangler.jsonc`.

## Prior coverage and companions

No prior ledger. Nothing was carried or excluded as a previous confirmation.

Companions were selected because the boundaries are real here: client DOM and storage (`CLIENT-SIDE.md`), HTTP sessions and Google tokens (`WEB-PROTOCOL-AND-AUTH.md`), Workers config and the edge tail (`CLOUD-AND-DEPLOYMENT.md`), the support model flag (`AI-AND-LLM.md`), the analyze cache (`DATA-ISOLATION-AND-LIFECYCLE.md`), feed fetch cost (`RESOURCE-EXHAUSTION-AND-AVAILABILITY.md`), and the lockfile (`SUPPLY-CHAIN-AND-RELEASE.md`). Memory-safety and desktop IPC companions were not selected: there is no native parser or local IPC. The art script only writes images.
