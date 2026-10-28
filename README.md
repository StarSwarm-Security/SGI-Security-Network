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

## Gate

The shell (castle map, tabs, Analyze, Paste Guard, Threat Index, Hive, Honest Shield, and the rest) stays behind a full-screen black abyss until the API accepts a session.

- Google Sign-In is first when a public client id is available from `GET /v1/auth/providers`, `window.SGI_GOOGLE_CLIENT_ID`, or `js/auth-config.js`. Do not commit a client secret.
- Anonymous fallback calls `POST /v1/auth/device` while that seal is offered, then confirms `GET /v1/me`.
- The bearer token is kept in this browser so a still-valid session skips the card. Apple stays hidden.
- Paste Guard still runs only on the device after the gate opens.

This repo does not deploy or publish the live hosts.

## Local

```bash
python3 -m http.server 8000
```

Open http://localhost:8000. The gate calls `https://sgi-api.starswarm.workers.dev` (that origin allows `http://localhost:8000`). No trackers. No invented live numbers.

## License

MIT for this shell. Fonts: OFL (Orbitron, Archivo Black, Sora, Inter).
