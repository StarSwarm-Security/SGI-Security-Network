/** Honest Shield layout: index markers on the shield graphic focus their corner widget; widget headers collapse/expand. */
const widget = n => document.getElementById(`hs-w${n}`);

function setOpen(n, open) {
  const t = document.getElementById(`hs-t${n}`);
  const w = widget(n);
  if (!t || !w) return;
  t.setAttribute('aria-expanded', String(open));
  w.classList.toggle('collapsed', !open);
}

function go(n) {
  const w = widget(n);
  if (!w) return;
  setOpen(n, true);
  document.querySelectorAll('.hs-widget.active').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.hs-mark').forEach(m => {
    const on = m.dataset.hsGo === String(n);
    m.classList.toggle('on', on);
    if (on) m.setAttribute('aria-current', 'true'); else m.removeAttribute('aria-current');
  });
  w.classList.add('active');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  w.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  w.focus({ preventScroll: true });
}

document.addEventListener('click', e => {
  const m = e.target.closest('[data-hs-go]');
  if (m) { go(m.dataset.hsGo); return; }
  const t = e.target.closest('[data-hs-toggle]');
  if (t) setOpen(t.dataset.hsToggle, t.getAttribute('aria-expanded') !== 'true');
});
