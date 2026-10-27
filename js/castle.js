/** Haunted space-castle hotspot map — Metroid / lonely-galaxy vibe. SVG only. */
export const WINGS = [
  { id: 'analyze',  name: 'Signal Keep',     sub: 'Analyze · Cisco paste',     tip: 'North keep — offline analyzers' },
  { id: 'threats',  name: 'Archive Spire',   sub: 'Threat Index',              tip: 'West spire — A–Z threats & bots' },
  { id: 'qhm',      name: 'Helium Observatory', sub: 'Quantum Helium + Liq', tip: 'East dome — bubbles & war map' },
  { id: 'hive',     name: 'Swarm Courtyard', sub: 'Defender Hive',             tip: 'Central yard — CCNA defender swarm' },
  { id: 'vpn',      name: 'Tunnel Gate',     sub: 'Free VPN desk',             tip: 'South tunnel — honest free VPNs' },
  { id: 'protect',  name: 'Armory',          sub: 'Protect tools',             tip: 'Lower armory — malware / spyware checks' },
  { id: 'swarm',    name: 'Barracks',        sub: 'Swarm Pass',                tip: 'West barracks — badges & credits' },
  { id: 'bounty',   name: 'Arena',           sub: 'Bounty board',              tip: 'Arena pits — demo leaderboards' },
  { id: 'redeem',   name: 'Vault',           sub: 'Redeem credits',            tip: 'Deep vault — gift cards Coming soon' },
];

const SVG = `
<svg class="castle-svg" viewBox="0 0 1200 720" role="img" aria-label="StarSwarm haunted space castle map">
  <defs>
    <linearGradient id="cg-stone" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2a3a55"/><stop offset="55%" stop-color="#121a2c"/><stop offset="100%" stop-color="#070b14"/>
    </linearGradient>
    <linearGradient id="cg-glow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#9ec4ff" stop-opacity=".55"/><stop offset="100%" stop-color="#f0c060" stop-opacity=".35"/>
    </linearGradient>
    <linearGradient id="cg-cloud" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6ec8ff" stop-opacity=".25"/><stop offset="100%" stop-color="#0a1220" stop-opacity="0"/>
    </linearGradient>
    <filter id="cg-soft"><feGaussianBlur stdDeviation="2.2"/></filter>
    <filter id="cg-amber"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>

  <!-- distant nebula / stars -->
  <rect width="1200" height="720" fill="url(#cg-cloud)" opacity=".35"/>
  <g fill="#c8d8f0" opacity=".55">
    <circle cx="80" cy="60" r="1.2"/><circle cx="180" cy="110" r=".8"/><circle cx="980" cy="70" r="1.4"/>
    <circle cx="1080" cy="140" r=".9"/><circle cx="640" cy="40" r="1"/><circle cx="420" cy="90" r=".7"/>
    <circle cx="860" cy="50" r="1.1"/><circle cx="240" cy="30" r=".6"/>
  </g>

  <!-- floating cloud shelf -->
  <ellipse cx="600" cy="640" rx="420" ry="48" fill="#1a2840" opacity=".55"/>
  <ellipse cx="600" cy="628" rx="360" ry="28" fill="#6ec8ff" opacity=".12" filter="url(#cg-soft)"/>

  <!-- base plinth -->
  <path d="M180 560 L1020 560 L980 620 L220 620 Z" fill="#0c1422" stroke="#3a5078" stroke-width="1.5"/>
  <path d="M220 560 L980 560 L960 590 L240 590 Z" fill="#152036" opacity=".9"/>

  <!-- WEST SPIRE (Threats) -->
  <g class="wing" data-go="threats" tabindex="0" role="button" aria-label="Archive Spire — Threat Index">
    <title>Archive Spire — Threat Index</title>
    <path d="M210 560 L210 280 L250 240 L290 280 L290 560 Z" fill="url(#cg-stone)" stroke="#8ab0d8" stroke-width="1.4"/>
    <path d="M230 240 L250 190 L270 240 Z" fill="#1c2a40" stroke="#f0c060" stroke-width="1.2"/>
    <rect x="235" y="320" width="30" height="22" rx="2" fill="#0a1220" stroke="#6ec8ff" stroke-width="1" class="win"/>
    <rect x="235" y="380" width="30" height="22" rx="2" fill="#0a1220" stroke="#6ec8ff" stroke-width="1" class="win"/>
    <rect x="235" y="440" width="30" height="22" rx="2" fill="#0a1220" stroke="#6ec8ff" stroke-width="1" class="win"/>
    <text x="250" y="265" text-anchor="middle" class="wlab">ARCHIVE</text>
    <text x="250" y="282" text-anchor="middle" class="wsub">Threat Index</text>
  </g>

  <!-- BARRACKS (Swarm Pass) left mid -->
  <g class="wing" data-go="swarm" tabindex="0" role="button" aria-label="Barracks — Swarm Pass">
    <title>Barracks — Swarm Pass</title>
    <path d="M290 560 L290 400 L380 380 L380 560 Z" fill="url(#cg-stone)" stroke="#8ab0d8" stroke-width="1.3"/>
    <rect x="310" y="430" width="40" height="28" rx="2" fill="#0a1220" stroke="#f0c060" stroke-width="1" class="win"/>
    <rect x="310" y="480" width="40" height="50" rx="3" fill="#080e18" stroke="#9ec4ff" stroke-width="1.2"/>
    <text x="335" y="415" text-anchor="middle" class="wlab">BARRACKS</text>
    <text x="335" y="432" text-anchor="middle" class="wsub">Swarm Pass</text>
  </g>

  <!-- CENTRAL KEEP (Analyze) -->
  <g class="wing" data-go="analyze" tabindex="0" role="button" aria-label="Signal Keep — Analyze">
    <title>Signal Keep — Analyze</title>
    <path d="M420 560 L420 220 L500 160 L580 220 L580 560 Z" fill="url(#cg-stone)" stroke="#c8d8f0" stroke-width="1.6"/>
    <path d="M470 160 L500 95 L530 160 Z" fill="#182234" stroke="#f0c060" stroke-width="1.5"/>
    <circle cx="500" cy="130" r="10" fill="#f0c060" opacity=".55" filter="url(#cg-amber)" class="beacon"/>
    <rect x="470" y="260" width="60" height="36" rx="3" fill="#0a1220" stroke="#6ec8ff" stroke-width="1.2" class="win"/>
    <rect x="470" y="320" width="60" height="36" rx="3" fill="#0a1220" stroke="#6ec8ff" stroke-width="1.2" class="win"/>
    <rect x="470" y="400" width="60" height="80" rx="4" fill="#060a12" stroke="#f0c060" stroke-width="1.4"/>
    <text x="500" y="205" text-anchor="middle" class="wlab">SIGNAL KEEP</text>
    <text x="500" y="222" text-anchor="middle" class="wsub">Analyze</text>
  </g>

  <!-- COURTYARD / HIVE (center front) -->
  <g class="wing" data-go="hive" tabindex="0" role="button" aria-label="Swarm Courtyard — Hive">
    <title>Swarm Courtyard — Hive</title>
    <ellipse cx="600" cy="520" rx="110" ry="38" fill="#0e1828" stroke="#6ec8ff" stroke-width="1.3" stroke-dasharray="4 3"/>
    <circle cx="600" cy="518" r="18" fill="none" stroke="#f0c060" stroke-width="1.2" opacity=".8"/>
    <circle cx="600" cy="518" r="6" fill="#f0c060" opacity=".7" class="beacon"/>
    <text x="600" y="500" text-anchor="middle" class="wlab">COURTYARD</text>
    <text x="600" y="545" text-anchor="middle" class="wsub">Hive</text>
  </g>

  <!-- EAST observatory (QHM) -->
  <g class="wing" data-go="qhm" tabindex="0" role="button" aria-label="Helium Observatory — Quantum Helium">
    <title>Helium Observatory — Quantum Helium</title>
    <path d="M620 560 L620 250 L780 250 L780 560 Z" fill="url(#cg-stone)" stroke="#8ab0d8" stroke-width="1.4"/>
    <ellipse cx="700" cy="230" rx="90" ry="55" fill="#152238" stroke="#6ec8ff" stroke-width="1.5"/>
    <ellipse cx="700" cy="220" rx="55" ry="32" fill="#0a1220" stroke="#9ec4ff" stroke-width="1.2" class="win"/>
    <circle cx="700" cy="218" r="12" fill="#6ec8ff" opacity=".35" class="beacon"/>
    <rect x="660" y="320" width="80" height="40" rx="3" fill="#0a1220" stroke="#6ec8ff" stroke-width="1" class="win"/>
    <rect x="660" y="400" width="80" height="40" rx="3" fill="#0a1220" stroke="#6ec8ff" stroke-width="1" class="win"/>
    <text x="700" y="285" text-anchor="middle" class="wlab">OBSERVATORY</text>
    <text x="700" y="302" text-anchor="middle" class="wsub">Quantum Helium</text>
  </g>

  <!-- ARENA (Bounty) right mid -->
  <g class="wing" data-go="bounty" tabindex="0" role="button" aria-label="Arena — Bounty board">
    <title>Arena — Bounty board</title>
    <path d="M780 560 L780 420 L900 400 L900 560 Z" fill="url(#cg-stone)" stroke="#8ab0d8" stroke-width="1.3"/>
    <path d="M800 470 L880 470 L860 530 L820 530 Z" fill="#0a1220" stroke="#f0c060" stroke-width="1.2"/>
    <text x="840" y="445" text-anchor="middle" class="wlab">ARENA</text>
    <text x="840" y="462" text-anchor="middle" class="wsub">Bounty</text>
  </g>

  <!-- ARMORY (Protect) far right low -->
  <g class="wing" data-go="protect" tabindex="0" role="button" aria-label="Armory — Protect">
    <title>Armory — Protect</title>
    <path d="M900 560 L900 360 L1020 340 L1020 560 Z" fill="url(#cg-stone)" stroke="#8ab0d8" stroke-width="1.3"/>
    <rect x="930" y="400" width="60" height="30" rx="2" fill="#0a1220" stroke="#ff6b7a" stroke-width="1" class="win"/>
    <rect x="940" y="470" width="40" height="55" rx="3" fill="#080e18" stroke="#9ec4ff" stroke-width="1.2"/>
    <text x="960" y="385" text-anchor="middle" class="wlab">ARMORY</text>
    <text x="960" y="402" text-anchor="middle" class="wsub">Protect</text>
  </g>

  <!-- TUNNEL GATE (VPN) south center -->
  <g class="wing" data-go="vpn" tabindex="0" role="button" aria-label="Tunnel Gate — VPN">
    <title>Tunnel Gate — VPN</title>
    <path d="M480 590 L720 590 L700 650 L500 650 Z" fill="#0c1422" stroke="#6ec8ff" stroke-width="1.4"/>
    <path d="M540 590 L660 590 L640 635 L560 635 Z" fill="#060a12" stroke="#f0c060" stroke-width="1.3"/>
    <text x="600" y="618" text-anchor="middle" class="wlab">TUNNEL</text>
    <text x="600" y="632" text-anchor="middle" class="wsub">VPN</text>
  </g>

  <!-- VAULT (Redeem) under keep -->
  <g class="wing" data-go="redeem" tabindex="0" role="button" aria-label="Vault — Redeem">
    <title>Vault — Redeem</title>
    <path d="M440 500 L560 500 L560 560 L440 560 Z" fill="#0a101c" stroke="#f0c060" stroke-width="1.4"/>
    <circle cx="500" cy="530" r="10" fill="none" stroke="#f0c060" stroke-width="1.5"/>
    <circle cx="500" cy="530" r="3" fill="#f0c060"/>
    <text x="500" y="492" text-anchor="middle" class="wlab">VAULT</text>
    <text x="500" y="555" text-anchor="middle" class="wsub">Redeem</text>
  </g>

  <!-- bridge / dog approach hint -->
  <path d="M560 650 L640 650 L620 700 L580 700 Z" fill="#101828" stroke="#3a5078" stroke-width="1" opacity=".7"/>
  <text x="600" y="688" text-anchor="middle" class="hint">★ dog spotlight guides you · click a wing</text>
</svg>`;

export function mountCastle(root, { onWing } = {}) {
  root.innerHTML = `
    <div class="castle-wrap">
      <div class="castle-chrome">
        <h2 class="hero-title">Space Castle</h2>
        <p class="lede castle-lede">Haunted fortress on a lonely nebula. Tap a wing to enter that deck. Dog spotlight still follows you.</p>
      </div>
      <div class="castle-stage" id="castle-stage">${SVG}</div>
      <div class="castle-list" id="castle-list" aria-label="Wing list fallback">
        ${WINGS.map(w => `
          <button type="button" class="castle-li" data-go="${w.id}" title="${w.tip}">
            <b>${w.name}</b><span>${w.sub}</span>
          </button>`).join('')}
      </div>
      <p class="fine castle-fine">Explore mode · SVG hotspots · list fallback on small screens. No trackers.</p>
    </div>`;

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
  root.querySelectorAll('.wing, .castle-li').forEach(bind);

  // Hover label echo
  const tip = document.createElement('div');
  tip.className = 'castle-tip';
  tip.hidden = true;
  root.querySelector('.castle-wrap').appendChild(tip);
  root.querySelectorAll('.wing').forEach(g => {
    g.addEventListener('pointerenter', () => {
      tip.hidden = false;
      tip.textContent = g.querySelector('title')?.textContent || g.getAttribute('aria-label') || '';
      g.classList.add('hot');
    });
    g.addEventListener('pointerleave', () => {
      tip.hidden = true;
      g.classList.remove('hot');
    });
  });

  return {
    highlight(id) {
      root.querySelectorAll('.wing').forEach(g => g.classList.toggle('active', g.getAttribute('data-go') === id));
    },
  };
}
