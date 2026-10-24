// BTC/ETH liquidation war map. Live from MarginPad (CORS, no key) + CoinGecko price.
// If either fails, falls back to SAMPLE clusters clearly labeled.
const MP = 'https://marginpad.io/api/v1';
const CG = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true';

function sampleClusters(price, symbol) {
  const rows = [];
  for (let i = -18; i <= 18; i++) {
    if (i === 0) continue;
    const p = Math.round(price * (1 + i * 0.008) / (symbol === 'BTC' ? 50 : 5)) * (symbol === 'BTC' ? 50 : 5);
    const side = i < 0 ? 'long_liquidated' : 'short_liquidated';
    const est = Math.abs(i) < 4 ? 8e6 / Math.abs(i) : 2e6 / Math.abs(i);
    rows.push({ price: p, side, est_notional: est * (0.6 + Math.random()) });
  }
  return rows;
}

export async function loadWarMap(symbol) {
  const id = symbol === 'ETH' ? 'ethereum' : 'bitcoin';
  let price = null, chg = null, livePrice = false, liveLiq = false, clusters = [], note = '';
  try {
    const r = await fetch(CG, { signal: AbortSignal.timeout(7000) });
    if (r.ok) {
      const j = await r.json();
      price = j[id]?.usd; chg = j[id]?.usd_24h_change; livePrice = price != null;
    }
  } catch {}
  try {
    const r = await fetch(`${MP}/clusters?symbol=${symbol}`, { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j.clusters) && j.clusters.length) {
        clusters = j.clusters; liveLiq = true;
        if (price == null && j.clusters.length) {
          const mid = j.clusters[Math.floor(j.clusters.length / 2)]?.price;
          if (mid) price = mid;
        }
      }
    }
  } catch {}
  if (!liveLiq) {
    if (price == null) price = symbol === 'BTC' ? 80000 : 2400;
    clusters = sampleClusters(price, symbol);
    note = 'SAMPLE liquidation clusters (modeled locally). Live badge turns on when MarginPad clusters load.';
  } else {
    note = 'Live clusters from MarginPad free API (modeled liquidation levels). Price from CoinGecko' + (livePrice ? '' : ' unavailable');
  }
  return { symbol, price, chg, clusters, livePrice, liveLiq, note, taken: new Date().toISOString() };
}

export function drawWarMap(canvas, data) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 640, h = canvas.clientHeight || 360;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const x = canvas.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, w, h);
  x.fillStyle = 'rgba(6,10,28,.55)'; x.fillRect(0, 0, w, h);
  if (!data?.clusters?.length || !data.price) {
    x.fillStyle = '#9aa3c7'; x.font = '13px Inter,sans-serif'; x.fillText('No liquidation data', 16, 28); return;
  }
  const prices = data.clusters.map(c => c.price);
  const lo = Math.min(...prices, data.price * 0.92), hi = Math.max(...prices, data.price * 1.08);
  const maxN = Math.max(...data.clusters.map(c => c.est_notional || 0), 1);
  const pad = { l: 54, r: 12, t: 28, b: 28 };
  const Y = p => pad.t + (1 - (p - lo) / (hi - lo || 1)) * (h - pad.t - pad.b);
  const Xn = n => pad.l + Math.sqrt(n / maxN) * (w - pad.l - pad.r) * 0.92;
  // grid
  x.strokeStyle = 'rgba(140,160,255,.1)'; x.lineWidth = 1;
  for (let i = 0; i < 6; i++) { const y = pad.t + i * (h - pad.t - pad.b) / 5; x.beginPath(); x.moveTo(pad.l, y); x.lineTo(w - pad.r, y); x.stroke(); }
  // bars
  for (const c of data.clusters) {
    const y = Y(c.price), len = Math.max(4, Xn(c.est_notional) - pad.l);
    const long = c.side && c.side.startsWith('long');
    const grd = x.createLinearGradient(pad.l, 0, pad.l + len, 0);
    if (long) { grd.addColorStop(0, 'rgba(255,45,85,.15)'); grd.addColorStop(1, 'rgba(255,45,85,.95)'); }
    else { grd.addColorStop(0, 'rgba(40,255,140,.15)'); grd.addColorStop(1, 'rgba(40,255,140,.95)'); }
    x.fillStyle = grd;
    x.fillRect(pad.l, y - 3, len, 6);
  }
  // mark price
  const my = Y(data.price);
  x.strokeStyle = '#4cc9ff'; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(pad.l, my); x.lineTo(w - pad.r, my); x.stroke(); x.setLineDash([]);
  x.fillStyle = '#4cc9ff'; x.font = '600 12px Sora,sans-serif';
  x.fillText('Mark $' + data.price.toLocaleString(undefined, { maximumFractionDigits: 0 }), pad.l + 6, my - 6);
  // labels
  x.fillStyle = '#9aa3c7'; x.font = '11px Inter,sans-serif'; x.textAlign = 'right';
  x.fillText('$' + hi.toLocaleString(undefined,{maximumFractionDigits:0}), pad.l - 6, pad.t + 4);
  x.fillText('$' + lo.toLocaleString(undefined,{maximumFractionDigits:0}), pad.l - 6, h - pad.b);
  x.textAlign = 'left';
  x.fillStyle = '#ff2d55'; x.fillText('◀ long liq', pad.l, h - 8);
  x.fillStyle = '#28ff8c'; x.fillText('short liq ▶', pad.l + 90, h - 8);
}
