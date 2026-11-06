# Security audit report

Run 1 of StarSwarm SGI Security Network. Profile: **standard**. Scope: this repository's static site, `edge/` tail, and `worker/` source. Budget: unset. Reviewed source: `0a55100e821ce45c820aedbd32448722b4c7a377` (`main`, clean). Execution: source reading plus one local Node import and a headless Chrome `file://` page. No deploy, no merge, and no request to production, Google, OSV, GitHub, RevenueCat, or D1.

No prior coverage ledger or findings file was available. This pass does not exhaust the target. The generated live `sgi` / Pages worker bundle described in `edge/README.md` is **out of scope** (not in the repo, not fetched). Live `sgi-api` and remote D1 are **out of scope**. Memory-safety and desktop IPC classes are **not applicable**.

Agents: 4 reconnaissance, 3 hunters, 1 post-wave critic, 1 final-clean critic, 2 candidate verifiers, 2 record verifiers. The final-clean critic returned no missing units and no reassignments.

## Posture

The API skeleton fails closed on Google, Apple, and RevenueCat when secrets are unset, stores session tokens as hashes, and keeps analyze behind a bearer. Paste Guard, Agent Guard, Config Auditor, the threat drawer, and the swarm-alert renderer encode or use `textContent`.

Cisco Analyze does not. It writes parser captures into `innerHTML`. That is the one confirmed issue. A second lead, distinct redeem error strings, stays `needs_validation` because code entropy and any zone rate limit are outside this repo.

## Confirmed

| Severity | Title | Boundary | Observed result |
| --- | --- | --- | --- |
| Medium | Cisco Analyze assigns unescaped parser captures to innerHTML | Untrusted paste to `#analyze-out` | Headless Chrome ran an svg `onload` handler from the rendered headline and finding title. |

### Cisco Analyze assigns unescaped parser captures to innerHTML

- **Source:** `app.js` lines 171–187, captures in `js/analyzers.js` (username at 1315–1321, DHCP pool name at 289 and 1216, BPDU at 808, err-disabled at 868). Headline copy is `js/analyzers.js` line 1574.
- **Lower-trust principal:** the author of text an operator pastes into Cisco Analyze.
- **Reproduction:** import `runSwarm`, pass `username <svg/onload=document.documentElement.dataset.xss=1> password hunter`, build the same HTML string the click handler builds, and assign it with `innerHTML` on a local file page.
- **Conditions:** the operator pastes and clicks Run offline (normal for this screen). The shell is inert until the gate has accepted a session. The token must match a capture that reaches a title. A show-interface name does not, because its character class excludes `<`. No CSP is defined in `index.html` or `edge/sgi-worker-tail.js`. Live response headers were not observed.
- **Result:** two svg elements were created (lede and title). `documentElement.dataset.xss` became `1`. The same string passed through `esc()` created no svg.
- **Impact:** script in the origin that stores the bearer in `localStorage` (`sgi.session.v1`) and in a non-HttpOnly `sgi_session` cookie. Likelihood medium, impact high, overall **medium** because the operator must paste the text and this is not stored XSS against other users.
- **Fix:** pass `summary.headline` and every finding field through the existing `esc()` before assigning `innerHTML`, as `paintScan` already does.

## Needs validation

These are not confirmed vulnerabilities and have no severity.

| Title | Trace | Blocker | Next step |
| --- | --- | --- | --- |
| Redeem failures distinguish code state, and a correct guess can grant credit or a promo tier | `POST /v1/auth/device` to `handleRedeemCode` failure branch (`worker/src/redeem/handler.ts` line 115) | D1 code entropy is not in the migration, and `wrangler.jsonc` shows no rate-limit binding | Local D1 fixtures only. Read-only inspection of stored code shape and zone rules. Do not guess codes against production. |

Detail is in `NEEDS-VALIDATION.md`.

## Hardening (not findings)

- `writeSession` keeps the bearer in `localStorage` and copies it into `document.cookie` without `HttpOnly`. Another origin cannot read it. Any script that does run here can. There is no server revoke route; `clearSession` only drops the browser copy.
- `index.html` has no Content-Security-Policy meta. The edge `SEC` headers set `nosniff` and `X-Frame-Options: DENY` but not CSP. A script policy would have been a second barrier on the Analyze sink. The static Pages tree has no `_headers` file, so framing of the static host is not proven from source. The edge tail denies framing when that worker serves the files.
- Hive detail and the study drawer assign first-party constants through `innerHTML`. Nothing lower-trust reaches them in this repo.
- `POST /v1/auth/device` gives each new UUID a 3-day trial and its own analyze window. Repeating an existing device id returns 409. The source documents the per-device cap. Attest devices before treating it as a cap on one person.
- The redeem `use_count` update commits before the redemption batch. A code with `max_uses` greater than 1 can lose uses without the same number of grants. The migration seeds no such row.
- RevenueCat `EXPIRATION` and `BILLING_ISSUE` mark the event applied even when zero entitlement rows change, so a later retry of that event id is ignored.
- Before setting `ENABLE_SUPPORT_LLM` to `1`, require a caller bound and a quota on `POST /v1/support/chat` and on `/agents/`. Today the flag is `0`, the AI binding is absent, and both handlers stay on the FAQ pack. The widget renders replies with `textContent`.
- `@modelcontextprotocol/client` is declared and is not imported from `worker/src`. Its body was not installed. No CVE was assigned.
- `js/auth-config.js` contains a public Google client id. The file describes it as a public identifier, not a secret. `.gitignore` covers `.env` and `.dev.vars`.

## Positive patterns

- Session lookup uses the SHA-256 of the bearer. Google verification pins RS256, a fixed JWKS URL, and `redirect: "error"`.
- The webhook fails closed when `REVENUECAT_WEBHOOK_SECRET` is empty and compares secrets with a hash plus `timingSafeEqual`.
- CORS is an exact allowlist. A bearer header, not an API cookie, carries the session.
- Analyze quota is consumed before the cache read. The cache key is a hash of the caller's own text.
- Swarm-feed upstreams are constants. The package query cannot choose the URL, and OSV results are not written into the shared cache.
- Breach and gift-card routes return 501 and do not perform a lookup or a transfer.

## Coverage

| Status | Count |
| --- | --- |
| covered | 14 |
| candidate | 2 |
| out_of_scope | 2 |
| not_applicable | 2 |

Both candidates have a final record in `findings.json` (one confirmed, one needs validation). One rejected record documents the analyze-cache claim that does not cross tenants. The final-clean critic accepted the ledger.

Counts in `findings.json`: **1 confirmed**, **1 needs_validation**, **1 rejected**.
