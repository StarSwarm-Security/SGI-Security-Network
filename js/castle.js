/** Cover-photo interactive map — hotspots over assets/cover.jpg. */
export const WINGS = [
  { id: 'analyze',  name: 'Signal Keep',       sub: 'Analyze · Paste Guard', tip: 'Central keep — Cisco + offline Paste Guard',
    box: [46.5, 22, 9, 34] },
  { id: 'threats',  name: 'Archive Spire',     sub: 'Threat Index',          tip: 'West spires — A–Z threats & bots',
    box: [40, 28, 7.5, 30] },
  { id: 'qhm',      name: 'Helium Observatory', sub: 'Quantum Helium + Liq', tip: 'East towers — bubbles & war map',
    box: [55, 26, 9, 32] },
  { id: 'hive',     name: 'Swarm Courtyard',   sub: 'Defender Hive',         tip: 'Front yard — CCNA defender swarm',
    box: [46, 54, 12, 16] },
  { id: 'shield',   name: 'Honest Shield',     sub: 'VPN + Protect',         tip: 'Gate + armory — honest free VPN & malware checks',
    box: [52, 58, 14, 22] },
  { id: 'swarm',    name: 'Barracks',          sub: 'Swarm Pass',            tip: 'West flank — badges & credits',
    box: [39, 56, 8, 18] },
  { id: 'bounty',   name: 'Arena',             sub: 'Bounty board',          tip: 'Upper crystals — demo leaderboards',
    box: [49, 12, 9, 12] },
  { id: 'redeem',   name: 'Vault',             sub: 'Redeem credits',        tip: 'Shield vault — gift cards Coming soon',
    box: [18, 44, 5.5, 14] },
];

function boxStyle([l, t, w, h]) {
  return `left:${l}%;top:${t}%;width:${w}%;height:${h}%`;
}

export function mountCastle(root, { onWing } = {}) {
  root.innerHTML = `
    <div class="castle-wrap">
      <div class="castle-chrome">
        <h2 class="hero-title">SGI Network</h2>
        <p class="lede castle-lede">Tap a region to open that deck. Dog spotlight still follows you.</p>
      </div>
      <div class="castle-stage" id="castle-stage">
        <div class="castle-map" id="castle-map" role="img" aria-label="StarSwarm SGI interactive map">
          <img class="castle-photo" src="assets/cover.jpg" alt="StarSwarm cover art" width="1500" height="500" decoding="async">
          ${WINGS.map(w => `
            <button type="button" class="castle-hot wing" data-go="${w.id}"
              style="${boxStyle(w.box)}"
              aria-label="${w.name} — ${w.sub}" title="${w.tip}">
              <span class="hot-lab">${w.name}</span>
              <span class="hot-sub">${w.sub}</span>
            </button>`).join('')}
        </div>
      </div>
      <div class="castle-list" id="castle-list" aria-label="Wing list fallback">
        ${WINGS.map(w => `
          <button type="button" class="castle-li" data-go="${w.id}" title="${w.tip}">
            <b>${w.name}</b><span>${w.sub}</span>
          </button>`).join('')}
      </div>
      <p class="fine castle-fine">Interactive map · clickable regions · list fallback on small screens. No trackers.</p>
    </div>`;

  const tip = document.createElement('div');
  tip.className = 'castle-tip';
  tip.hidden = true;
  root.querySelector('.castle-wrap').appendChild(tip);

  const bind = el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-go');
      if (id && onWing) onWing(id, el);
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const id = el.getAttribute('data-go');
        if (id && onWing) onWing(id, el);
      }
    });
  };
  root.querySelectorAll('.castle-hot, .castle-li').forEach(bind);

  root.querySelectorAll('.castle-hot').forEach(g => {
    g.addEventListener('pointerenter', () => {
      tip.hidden = false;
      tip.textContent = g.getAttribute('aria-label') || '';
      g.classList.add('hot');
    });
    g.addEventListener('pointerleave', () => {
      tip.hidden = true;
      g.classList.remove('hot');
    });
  });

  return {
    highlight(id) {
      root.querySelectorAll('.castle-hot').forEach(g =>
        g.classList.toggle('active', g.getAttribute('data-go') === id));
    },
  };
}
