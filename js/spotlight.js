/** Dog spotlight — Metroid/haunted-ship cursor beam. Lightweight canvas. */
export function mountSpotlight() {
  const c = document.createElement('canvas');
  c.className = 'spot-canvas';
  c.setAttribute('aria-hidden', 'true');
  document.body.appendChild(c);
  const ctx = c.getContext('2d', { alpha: true });

  let w = 0, h = 0, mx = -9999, my = -9999;
  let dogX = 0, dogY = 0;
  let flash = null; // {x,y,r,t}
  let raf = 0, dirty = true;

  function resize() {
    w = c.width = window.innerWidth;
    h = c.height = window.innerHeight;
    // Cover dog sits lower-center in art; map to viewport origin of beam
    dogX = w * 0.48;
    dogY = h * 0.72;
    dirty = true;
  }

  function onMove(e) {
    mx = e.clientX; my = e.clientY; dirty = true;
  }
  function onLeave() { mx = -9999; my = -9999; dirty = true; }

  function onClick(e) {
    const t = e.target.closest('.panel,.glass,.cardx,.hub button,.ti-item,.chip,.cta,.tabs button,.find,.sp-badge,.bn-table-wrap,button,a');
    if (t) {
      t.classList.add('lit-flash');
      setTimeout(() => t.classList.remove('lit-flash'), 700);
    }
    flash = { x: e.clientX, y: e.clientY, r: 40, t: performance.now() };
    dirty = true;
  }

  function draw(now) {
    raf = 0;
    if (!dirty && !flash) return;
    dirty = false;
    ctx.clearRect(0, 0, w, h);
    if (mx < -1000) {
      // idle: faint dog wash
      const g = ctx.createRadialGradient(dogX, dogY, 0, dogX, dogY, Math.max(w, h) * 0.35);
      g.addColorStop(0, 'rgba(240,200,140,0.06)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      return;
    }

    // Soft cone from dog toward cursor
    const dx = mx - dogX, dy = my - dogY;
    const dist = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);
    const half = 0.22; // rad ~12.5deg
    const reach = Math.min(dist + 180, Math.hypot(w, h));

    ctx.save();
    ctx.translate(dogX, dogY);
    ctx.rotate(ang);
    const cone = ctx.createLinearGradient(0, 0, reach, 0);
    cone.addColorStop(0, 'rgba(255,230,180,0.22)');
    cone.addColorStop(0.45, 'rgba(200,220,255,0.10)');
    cone.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(reach, -reach * Math.tan(half));
    ctx.lineTo(reach, reach * Math.tan(half));
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Cursor spotlight disc (flashlight)
    const R = Math.min(220, 90 + dist * 0.08);
    const spot = ctx.createRadialGradient(mx, my, 0, mx, my, R);
    spot.addColorStop(0, 'rgba(255,240,210,0.28)');
    spot.addColorStop(0.35, 'rgba(180,210,255,0.12)');
    spot.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spot;
    ctx.fillRect(mx - R, my - R, R * 2, R * 2);

    // Click flash ring
    if (flash) {
      const age = (now - flash.t) / 700;
      if (age >= 1) flash = null;
      else {
        const rr = flash.r + age * 120;
        const a = (1 - age) * 0.55;
        ctx.beginPath();
        ctx.arc(flash.x, flash.y, rr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(240,192,96,${a})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        const fg = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, rr);
        fg.addColorStop(0, `rgba(255,230,180,${a * 0.35})`);
        fg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = fg;
        ctx.fillRect(flash.x - rr, flash.y - rr, rr * 2, rr * 2);
        dirty = true;
      }
    }
  }

  function loop(now) {
    draw(now || performance.now());
    if (dirty || flash) raf = requestAnimationFrame(loop);
  }
  function kick() {
    if (!raf) raf = requestAnimationFrame(loop);
  }

  resize();
  // Screenshot / demo: ?spot=0.6,0.45 as viewport fractions
  try {
    const sp = new URLSearchParams(location.search).get('spot');
    if (sp) {
      const [fx, fy] = sp.split(',').map(Number);
      mx = w * (fx || 0.55); my = h * (fy || 0.4); dirty = true;
    }
  } catch (_) {}
  window.addEventListener('resize', () => { resize(); kick(); }, { passive: true });
  window.addEventListener('pointermove', e => { onMove(e); kick(); }, { passive: true });
  window.addEventListener('pointerleave', onLeave, { passive: true });
  window.addEventListener('pointerdown', e => { onClick(e); kick(); }, { passive: true });
  kick();

  return { destroy() { c.remove(); } };
}
