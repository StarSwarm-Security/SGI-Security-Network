/** Interactive map — label anchors on assets/v2/sgi-map-v20-1500x844 (cover v20 + sgi-hero-v1 nebula floor). `at` is the label center in percent. */
export const WINGS = [
  { id: 'bounty',  name: 'Arena',           sub: 'Bounty board',          at: [50, 8] },   // castle crown
  { id: 'analyze', name: 'Signal Keep',     sub: 'Analyze · Paste Guard', at: [50, 27] },  // castle body
  { id: 'threats', name: 'Archive Spire',   sub: 'Threat Index',          at: [19, 25] },  // teal arc, left nebula
  { id: 'redeem',  name: 'Vault',           sub: 'Redeem credits',        at: [86, 33] },  // ringed planet
  { id: 'shield',  name: 'Honest Shield',   sub: 'VPN + Protect',         at: [66, 41] },  // above the shield
  { id: 'swarm',   name: 'Barracks',        sub: 'Swarm Pass',            at: [27, 60] },  // the panther
  { id: 'hive',    name: 'Swarm Courtyard', sub: 'Defender Hive',         at: [50, 77] },  // nebula floor
];

function anchorStyle([x, y]) {
  return `left:${x}%;top:${y}%`;
}

export function mountCastle(root, { onWing } = {}) {
  root.innerHTML = `
    <div class="castle-wrap">
      <div class="castle-chrome">
        <h2 class="hero-title">SGI Network</h2>
        <p class="lede castle-lede">Tap a label to open that deck. Dog spotlight still follows you.</p>
      </div>
      <div class="castle-stage" id="castle-stage">
        <div class="castle-map" id="castle-map" role="img" aria-label="StarSwarm SGI interactive map">
          <picture><source srcset="assets/v2/sgi-map-v20-1500x844.webp" type="image/webp"><img class="castle-photo" src="assets/v2/sgi-map-v20-1500x844.png" alt="StarSwarm map: a panther's beam lights a shield under a floating castle over a blue and purple nebula" width="1500" height="844" decoding="async"></picture>
          <div class="castle-headline" aria-hidden="true"><p class="art-kicker">StarSwarm</p><p class="art-line">Agentic Intelligence</p></div>
          ${WINGS.map(w => `
            <button type="button" class="castle-hot wing" data-go="${w.id}"
              style="${anchorStyle(w.at)}"
              aria-label="${w.name} — ${w.sub}">
              <span class="hot-lab">${w.name}</span>
              <span class="hot-sub">${w.sub}</span>
            </button>`).join('')}
        </div>
      </div>
      <div class="castle-list" id="castle-list" aria-label="Wing list fallback">
        ${WINGS.map(w => `
          <button type="button" class="castle-li" data-go="${w.id}">
            <b>${w.name}</b><span>${w.sub}</span>
          </button>`).join('')}
      </div>
      <p class="fine castle-fine">Interactive map · clickable labels · list fallback on small screens. No trackers.</p>
    </div>`;

  const open = el => {
    const id = el.getAttribute('data-go');
    if (id && onWing) onWing(id, el);
  };
  root.querySelectorAll('.castle-hot, .castle-li').forEach(el => {
    el.addEventListener('click', () => open(el));
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open(el);
      }
    });
  });

  return {
    highlight(id) {
      root.querySelectorAll('.castle-hot').forEach(g =>
        g.classList.toggle('active', g.getAttribute('data-go') === id));
    },
  };
}
