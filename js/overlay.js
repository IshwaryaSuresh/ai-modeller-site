// The accuracy overlay: the architect's drawing and Idam's exported plan, one over the other.
// Pick a floor, show either or both, drag to pan, and zoom with the buttons, a pinch or ctrl/cmd + scroll.
(() => {
  const host = document.getElementById('overlay');
  if (!host) return;
  let svg = null, vb = [0, 0, 1, 1], home = null;
  const cache = {};
  const setVB = (v) => { vb = v; svg?.setAttribute('viewBox', v.map((n) => n.toFixed(1)).join(' ')); };
  const zoomAt = (f, cx = 0.5, cy = 0.5) => { const [x, y, w, h] = vb; const nw = w * f, nh = h * f; setVB([x + (w - nw) * cx, y + (h - nh) * cy, nw, nh]); };
  const show = async (floor) => {
    const text = cache[floor] ?? (cache[floor] = await (await fetch(`drawings/overlay-${floor}.svg`)).text());
    svg?.remove();
    host.insertAdjacentHTML('afterbegin', text);
    svg = host.querySelector('svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `The ${{ gf: 'ground floor', ff: 'first floor', sf: 'terrace' }[floor]} plan: the architect's lines in grey with Idam's exported lines in orange on top`);
    svg.querySelectorAll('path').forEach((p) => p.setAttribute('vector-effect', 'non-scaling-stroke'));
    home = svg.getAttribute('viewBox').split(' ').map(Number);
    setVB(home);
  };
  host.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
    host.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    show(b.dataset.f);
  }));
  host.dataset.show = 'both';
  host.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => {
    host.querySelectorAll('[data-s]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    host.dataset.show = b.dataset.s;
  }));
  host.querySelector('[data-z="in"]').addEventListener('click', () => zoomAt(0.6));
  host.querySelector('[data-z="out"]').addEventListener('click', () => zoomAt(1 / 0.6));
  // Pan and pinch
  const pts = new Map();
  let last = null;
  host.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; host.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); });
  host.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !svg) return;
    const prev = pts.get(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    const r = host.getBoundingClientRect();
    const s = Math.max(vb[2] / r.width, vb[3] / r.height);
    if (pts.size === 1) setVB([vb[0] - (e.clientX - prev[0]) * s, vb[1] - (e.clientY - prev[1]) * s, vb[2], vb[3]]);
    else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (last) zoomAt(last / d, ((a[0] + b[0]) / 2 - r.left) / r.width, ((a[1] + b[1]) / 2 - r.top) / r.height);
      last = d;
    }
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) last = null; };
  host.addEventListener('pointerup', up);
  host.addEventListener('pointercancel', up);
  host.addEventListener('wheel', (e) => {
    if (!svg || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const r = host.getBoundingClientRect();
    zoomAt(Math.exp(e.deltaY * 0.01), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }, { passive: false });
  show('gf');
})();
