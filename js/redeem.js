/** Credits redeem UI — Coming soon. No real redemptions, wallets, or transfers. */
import { creditBalance, getPass } from './swarm-pass.js';

const CARDS = [
  {
    id: 'xmr',
    name: 'Monero (XMR) gift card',
    blurb: 'Privacy-narrative lane. Partner swap or gift-card issuer required before any payout.',
    cost: 5000,
    status: 'coming',
  },
  {
    id: 'sol',
    name: 'Solana (SOL) gift card',
    blurb: 'Stable partner gift-card path once a licensed vendor is wired.',
    cost: 5000,
    status: 'coming',
  },
  {
    id: 'eth',
    name: 'Ethereum (ETH) gift card',
    blurb: 'Same Coming-soon rail as SOL — display only until Terms + KYC partner.',
    cost: 5000,
    status: 'coming',
  },
  {
    id: 'btc',
    name: 'Bitcoin (BTC) gift card',
    blurb: 'Fold-style BTC gift cards (e.g. merchant gift cards that settle or earn in Bitcoin, as Fold has advertised with brands like Steak n Shake) are an example partner path — not integrated.',
    cost: 5000,
    status: 'coming',
  },
];

export function mountRedeem(root) {
  const paint = () => {
    const bal = creditBalance();
    const cards = CARDS.map(c => `
      <article class="cardx redeem-card coming">
        <div class="row-head" style="margin:0 0 4px">
          <h3>${c.name}</h3>
          <span class="badge sample">Coming soon</span>
        </div>
        <p>${c.blurb}</p>
        <p class="fine">${c.cost.toLocaleString()} SC · your balance ${bal.toLocaleString()} SC</p>
        <button type="button" class="cta disabled" disabled aria-disabled="true">Redeem — Coming soon</button>
      </article>`).join('');

    root.innerHTML = `
      <div class="row-head">
        <h2>Redeem Swarm Credits</h2>
        <span class="badge live">${bal} SC</span>
      </div>
      <p class="lede">UI only. No wallets, no transfers, no gift cards sent. Crypto gift-card redeem is <b>future</b> and may need KYC through a licensed partner.</p>
      <div class="cards3">${cards}</div>
      <div class="sp-legal">
        <h3 class="sp-sub">Disclosure</h3>
        <ul class="sp-terms">
          <li><b>Coming soon / needs partner + Terms.</b> StarSwarm does not process XMR, SOL, ETH, or BTC gift-card redemptions in this build.</li>
          <li>Example partner path for BTC: Fold-style Bitcoin gift cards / merchant gift cards that settle or earn in BTC (Fold has publicly advertised with brands such as Steak n Shake). Mention is illustrative only — no affiliation unless a signed partner deal exists.</li>
          <li>Future redeem may require identity verification (KYC), tax forms, and geographic eligibility. SC has no cash value today.</li>
          <li>Earn SC on Swarm Pass via tour, check-in, and streaks — never for install alone.</li>
        </ul>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="chip" data-go="swarm" type="button">Swarm Pass</button>
        <button class="chip" data-go="bounty" type="button">Bounty board</button>
      </div>`;

    root.querySelectorAll('[data-go]').forEach(b => {
      b.onclick = () => window.dispatchEvent(new CustomEvent('sgi:goto', { detail: b.dataset.go }));
    });
  };
  paint();
  return { refresh: paint };
}
