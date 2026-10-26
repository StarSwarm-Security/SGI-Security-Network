/** Bounty leaderboards Phase 0 — demo only. USDC/XMR grayed Coming soon. Swarm Credits only. */

const SEASONS = [
  {
    id: 's0',
    name: 'Season 0 · Demo Hunt',
    status: 'demo',
    potLabel: 'Sample pot (not funded)',
    rows: [
      { rank: 1, handle: 'neonfox', score: 2400, findings: 3, badge: 'Swarm Lead' },
      { rank: 2, handle: 'packetwitch', score: 1850, findings: 2, badge: 'Sentinel' },
      { rank: 3, handle: 'qbit_guard', score: 1620, findings: 2, badge: 'Sentinel' },
      { rank: 4, handle: 'hive_runner', score: 980, findings: 1, badge: 'Scout' },
      { rank: 5, handle: 'cipher_owl', score: 740, findings: 1, badge: 'Scout' },
      { rank: 6, handle: 'grayroute', score: 510, findings: 1, badge: 'Scout' },
      { rank: 7, handle: 'nullspan', score: 320, findings: 0, badge: 'Scout' },
      { rank: 8, handle: 'latency_cat', score: 210, findings: 0, badge: 'Scout' },
    ],
  },
  {
    id: 's1',
    name: 'Season 1 · Invite (preview)',
    status: 'preview',
    potLabel: 'USDC invite pool — not live',
    rows: [
      { rank: 1, handle: '—', score: 0, findings: 0, badge: 'TBA' },
      { rank: 2, handle: '—', score: 0, findings: 0, badge: 'TBA' },
      { rank: 3, handle: '—', score: 0, findings: 0, badge: 'TBA' },
    ],
  },
];

export function mountBounty(root) {
  let season = SEASONS[0];
  let rail = 'sc'; // sc | usdc | xmr

  const paint = () => {
    const rows = season.rows.map(r => `
      <tr>
        <td class="rk">#${r.rank}</td>
        <td><b>${r.handle}</b><span class="fine"> · ${r.badge}</span></td>
        <td>${r.findings}</td>
        <td class="sc">${r.score.toLocaleString()} SC</td>
      </tr>`).join('');

    root.innerHTML = `
      <div class="row-head">
        <h2>Bounty board</h2>
        <span class="badge sample">Phase 0 demo</span>
      </div>
      <p class="lede">Sample seasons and handles. Scores are Swarm Credits only. Cash and Monero rails are grayed until counsel, escrow, and a funded pot.</p>
      <div class="chiprow" id="bn-seasons">
        ${SEASONS.map(s => `<button type="button" class="chip ${s.id === season.id ? 'on' : ''}" data-sid="${s.id}">${s.name}</button>`).join('')}
      </div>
      <div class="bn-rails">
        <span class="lbl" style="margin:0">Payout rail</span>
        <button type="button" class="chip ${rail === 'sc' ? 'on' : ''}" data-rail="sc">Swarm Credits</button>
        <button type="button" class="chip disabled" data-rail="usdc" disabled title="Coming soon">USDC · Coming soon</button>
        <button type="button" class="chip disabled" data-rail="xmr" disabled title="Coming soon">XMR · Coming soon</button>
      </div>
      <p class="fine bn-pot">${season.potLabel} · Active rail: <b>Swarm Credits</b> (demo)</p>
      <div class="bn-table-wrap">
        <table class="bn-table">
          <thead><tr><th>Rank</th><th>Handle</th><th>Findings</th><th>Score</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="fine">No real bounties, wallets, or transfers. USDC/XMR toggles stay disabled until partner + Terms. Handles are fictional.</p>
      <div class="row" style="margin-top:8px">
        <button class="chip" data-go="swarm" type="button">Swarm Pass</button>
        <button class="chip" data-go="redeem" type="button">Redeem credits</button>
      </div>`;

    root.querySelectorAll('#bn-seasons .chip').forEach(b => {
      b.onclick = () => {
        season = SEASONS.find(s => s.id === b.dataset.sid) || SEASONS[0];
        paint();
      };
    });
    root.querySelectorAll('[data-go]').forEach(b => {
      b.onclick = () => window.dispatchEvent(new CustomEvent('sgi:goto', { detail: b.dataset.go }));
    });
  };
  paint();
  return { refresh: paint };
}
