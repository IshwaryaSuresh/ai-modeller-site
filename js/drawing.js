// Sheet viewers: a drawing set as one SVG (each sheet a <g data-sheet data-box>), a button per sheet,
// drag to pan, and zoom with the buttons, a pinch, or ctrl/cmd + scroll. Line weights are the sheet's
// own pens, so zooming in reads like a print. Each set loads when it first comes near the screen.
(() => {
  const label = (n) => n.toLowerCase().replace(/ plan$/, '').replace(/ elevation$/, '').replace(/^\w|\s\w/g, (c) => c.toUpperCase()).replace(/Section (\w)-(\w)/, (_, a, b) => `Section ${a.toUpperCase()}-${b.toUpperCase()}`);

  function viewer(sheet) {
    const nav = sheet.querySelector('.seg');
    const src = sheet.dataset.src;
    let svg, vb = [0, 0, 1, 1], anim = 0;
    const setVB = (v) => { vb = v; svg.setAttribute('viewBox', v.map((n) => n.toFixed(1)).join(' ')); };
    const fit = (box) => {
      const r = sheet.getBoundingClientRect();
      const aspect = r.width / Math.max(1, r.height);
      const pad = Math.max(box.width, box.height) * 0.06;
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

    const load = () => fetch(src).then((r) => r.text()).then((text) => {
      sheet.insertAdjacentHTML('afterbegin', text);
      sheet.classList.remove('loading');
      svg = sheet.querySelector('svg');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', sheet.dataset.label || 'Drawing set');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      const [, , W, H] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
      const all = { x: 0, y: 0, width: W, height: H };
      const sheets = [...svg.querySelectorAll('g[data-sheet]')].map((g) => {
        const [x, y, w, h] = g.dataset.box.split(' ').map(Number);
        return { name: g.dataset.sheet, box: { x, y, width: w, height: h } };
      });
      const buttons = [];
      const add = (text, box) => {
        const b = document.createElement('button');
        b.textContent = text;
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () => { buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b))); go(fit(box)); });
        nav.append(b);
        buttons.push(b);
      };
      add('All sheets', all);
      for (const s of sheets) add(label(s.name), s.box);
      // Open on the sheet asked for (a section shows the most), else the first
      const want = sheets.findIndex((s) => s.name === sheet.dataset.open);
      const k = want >= 0 ? want : 0;
      buttons[k + 1].setAttribute('aria-pressed', 'true');
      setVB(fit(sheets[k].box));
    });

    // Load when the viewer comes within a screen of view
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '100% 0px' });
    io.observe(sheet);

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
    sheet.querySelector('.zin').addEventListener('click', () => svg && zoomAt(0.7));
    sheet.querySelector('.zout').addEventListener('click', () => svg && zoomAt(1 / 0.7));
  }

  document.querySelectorAll('.sheet[data-src]').forEach(viewer);

  // The survey and Idam's elevation, one over the other: drag the divider to compare
  document.querySelectorAll('.survey').forEach((c) => {
    const top = c.querySelector('.top');
    const range = c.querySelector('input[type=range]');
    const handle = c.querySelector('.handle');
    const set = (v) => { top.style.clipPath = `inset(0 0 0 ${v}%)`; handle.style.left = `${v}%`; };
    range.addEventListener('input', () => set(range.value));
    set(range.value);
  });
})();
