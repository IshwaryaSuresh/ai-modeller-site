// The DWG drawing viewer: the exported sheets as an SVG, with a button per
// drawing (found from the titles on the sheet), drag to pan, and zoom with the
// buttons, a pinch, or ctrl/cmd + scroll.
(() => {
  const sheet = document.getElementById('sheet');
  const nav = document.getElementById('sheetnav');
  if (!sheet) return;
  let svg, vb = [0, 0, 1, 1], anim = 0;

  const setVB = (v) => { vb = v; svg.setAttribute('viewBox', v.map((n) => n.toFixed(1)).join(' ')); };
  const fit = (box) => {
    const r = sheet.getBoundingClientRect();
    const aspect = r.width / Math.max(1, r.height);
    const pad = Math.max(box.width, box.height) * 0.08;
    let w = box.width + pad * 2, h = box.height + pad * 2;
    if (w / h < aspect) w = h * aspect; else h = w / aspect;
    return [box.x + box.width / 2 - w / 2, box.y + box.height / 2 - h / 2, w, h];
  };
  const go = (to, ms = 700) => {
    cancelAnimationFrame(anim);
    const from = vb.slice(), t0 = performance.now();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) ms = 0;
    const step = (t) => {
      const k = ms ? Math.min(1, (t - t0) / ms) : 1;
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      setVB(from.map((v, i) => v + (to[i] - v) * e));
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  };
  const zoomAt = (f, cx = 0.5, cy = 0.5) => {
    const [x, y, w, h] = vb;
    const nw = w * f, nh = h * f;
    setVB([x + (w - nw) * cx, y + (h - nh) * cy, nw, nh]);
  };

  fetch('drawings/courtyard-house.svg').then((r) => r.text()).then((text) => {
    sheet.insertAdjacentHTML('afterbegin', text);
    svg = sheet.querySelector('svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Working drawings exported by Idam: ground and first floor plans, four elevations and section A-A');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const all = svg.getBBox();
    setVB(fit(all));

    // Each drawing's title sits at its left edge: a drawing runs from its title to the next one's
    const items = [...svg.querySelectorAll('path, text')].map((el) => { try { return el.getBBox(); } catch { return null; } }).filter((b) => b && (b.width || b.height));
    const titles = [...svg.querySelectorAll('text')].filter((t) => Number(t.getAttribute('font-size')) >= 300 && t.textContent.trim().length > 3).map((t) => ({ text: t.textContent.trim(), b: t.getBBox() })).sort((a, b) => a.b.x - b.b.x);
    const named = titles.map((t, k) => {
      const x0 = t.b.x - 200, x1 = k + 1 < titles.length ? titles[k + 1].b.x - 200 : Infinity;
      const mine = items.filter((b) => b.x >= x0 && b.x + b.width <= x1);
      if (!mine.length) return null;
      return { name: t.text, x0: Math.min(...mine.map((b) => b.x)), x1: Math.max(...mine.map((b) => b.x + b.width)), y0: Math.min(...mine.map((b) => b.y)), y1: Math.max(...mine.map((b) => b.y + b.height)) };
    }).filter(Boolean);
    const label = (n) => n.replace('GROUND FLOOR PLAN', 'Ground floor').replace('FIRST FLOOR PLAN', 'First floor').replace(' ELEVATION', '').replace('SECTION ', 'Section ').toLowerCase().replace(/^\w|\s\w/g, (c) => c.toUpperCase()).replace('Section A-a', 'Section A-A');
    const buttons = [];
    const add = (text, box) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => { buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b))); go(fit(box)); });
      nav.append(b);
      buttons.push(b);
      return b;
    };
    add('All sheets', all);
    for (const g of named) add(label(g.name), { x: g.x0, y: g.y0, width: g.x1 - g.x0, height: g.y1 - g.y0 });
    // Open on the plan
    const plan = buttons[1] ?? buttons[0];
    plan.setAttribute('aria-pressed', 'true');
    const p = named[0];
    if (p) setVB(fit({ x: p.x0, y: p.y0, width: p.x1 - p.x0, height: p.y1 - p.y0 }));
  });

  // Pan and pinch
  const pts = new Map();
  let last = null;
  sheet.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    sheet.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    cancelAnimationFrame(anim);
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !svg) return;
    const prev = pts.get(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    const r = sheet.getBoundingClientRect();
    const s = Math.max(vb[2] / r.width, vb[3] / r.height);
    if (pts.size === 1) {
      setVB([vb[0] - (e.clientX - prev[0]) * s, vb[1] - (e.clientY - prev[1]) * s, vb[2], vb[3]]);
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (last) zoomAt(last / d, ((a[0] + b[0]) / 2 - r.left) / r.width, ((a[1] + b[1]) / 2 - r.top) / r.height);
      last = d;
    }
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) last = null; };
  sheet.addEventListener('pointerup', up);
  sheet.addEventListener('pointercancel', up);
  sheet.addEventListener('wheel', (e) => {
    if (!svg || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const r = sheet.getBoundingClientRect();
    zoomAt(Math.exp(e.deltaY * 0.01), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }, { passive: false });
  document.getElementById('zin').addEventListener('click', () => svg && zoomAt(0.7));
  document.getElementById('zout').addEventListener('click', () => svg && zoomAt(1 / 0.7));
})();
