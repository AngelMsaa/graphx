/* GraphX · sistemas: polaridad, retrasos y bucles de realimentación (Meadows, Thinking in Systems).
 *
 * Una arista con `polarity` ("+" el efecto va en el mismo sentido que la causa, "-" en el contrario) entra
 * en el análisis de bucles. Un ciclo con un número par de "-" refuerza (R); impar, equilibra (B). Un bucle
 * B con un retraso (`delay`) oscila. Los bucles se calculan sobre el modelo entero, no sobre lo visible:
 * plegar no debe inventar ni esconder un bucle. Los `groups` del JSON de tipo R o B pasan por el mismo
 * camino, con su nombre y su meta.
 *
 * El ensamblador solo incluye este fichero cuando alguna arista tiene polaridad o el JSON trae grupos:
 * un mapa sin ellas se pinta exactamente igual que sin el módulo.                                   */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GraphX = Object.assign(root.GraphX || {}, { systems: api });
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const MAX_LEN = 8, MAX_LOOPS = 50;
  const STR = {
    es: { R: 'bucle que refuerza', B: 'bucle que equilibra', delay: 'retraso', pol: '+ mismo sentido · − sentido contrario', loops: 'Bucles',
      osc: 'riesgo de oscilación: un bucle que equilibra con retraso se pasa de largo', inLoops: 'En bucles', purpose: 'Propósito',
      stated: 'Declarado', observed: 'Observado', mismatch: 'lo que dice perseguir no es lo que hace', goal: 'Meta', noGoal: 'sin meta: un bucle que equilibra necesita una' },
    en: { R: 'reinforcing loop', B: 'balancing loop', delay: 'delay', pol: '+ same direction · − opposite direction', loops: 'Loops',
      osc: 'oscillation risk: a balancing loop with a delay overshoots', inLoops: 'In loops', purpose: 'Purpose',
      stated: 'Stated', observed: 'Observed', mismatch: 'what it says it pursues is not what it does', goal: 'Goal', noGoal: 'no goal: a balancing loop needs one' }
  };

  /* polaridad y retraso efectivos: lo de la arista, si no lo que su tipo trae en el paquete */
  function effective(e, pack) {
    const d = (pack && pack.edgeKinds && pack.edgeKinds[e.kind]) || {};
    return { polarity: e.polarity != null ? e.polarity : d.polarity, delay: e.delay != null ? !!e.delay : !!d.delay };
  }

  /* Ciclos simples sobre las aristas con polaridad. La enumeración es exponencial en el peor caso, así que
     se corta en ciclos de MAX_LEN aristas y en MAX_LOOPS bucles; `truncated` lo dice. Cada ciclo se cuenta
     una vez: se arranca solo desde su pieza de menor orden y no se vuelve a pasar por debajo de ella. */
  function findLoops(edges, pack, o) {
    o = o || {};
    const maxLen = o.maxLen || MAX_LEN, maxLoops = o.maxLoops || MAX_LOOPS;
    const pol = edges.map(e => Object.assign({ e }, effective(e, pack))).filter(x => x.polarity === '+' || x.polarity === '-');
    const order = new Map();
    pol.forEach(x => { [x.e.from, x.e.to].forEach(id => { if (!order.has(id)) order.set(id, order.size); }); });
    const out = new Map();
    pol.forEach(x => { if (!out.has(x.e.from)) out.set(x.e.from, []); out.get(x.e.from).push(x); });
    const loops = [];
    let truncated = false;
    for (const [start, si] of order) {
      const path = [], onPath = new Set([start]);
      const walk = at => {
        if (loops.length >= maxLoops) { truncated = true; return; }
        for (const x of out.get(at) || []) {
          const to = x.e.to;
          if (order.get(to) < si) continue;
          if (to === start) { loops.push(path.concat(x)); if (loops.length >= maxLoops) { truncated = true; return; } continue; }
          if (onPath.has(to) || path.length + 1 >= maxLen) { if (!onPath.has(to)) truncated = true; continue; }
          path.push(x); onPath.add(to); walk(to); onPath.delete(to); path.pop();
        }
      };
      walk(start);
      if (truncated && loops.length >= maxLoops) break;
    }
    return { loops: loops.map(p => describe(p)), truncated };
  }
  function describe(p) {
    const neg = p.filter(x => x.polarity === '-').length;
    return { edges: p.map(x => x.e.id), nodes: p.map(x => x.e.from), type: neg % 2 ? 'B' : 'R', delay: p.some(x => x.delay) };
  }

  /* bucles calculados + grupos R/B del JSON, sin repetir: un grupo con las mismas aristas que un bucle le
     pone nombre y meta; un grupo que no cierra ciclo se queda con lo que declare */
  function analyze(spec) {
    const pack = spec.pack && typeof spec.pack === 'object' ? spec.pack : null;
    const edges = spec.edges || [], byId = new Map(edges.map(e => [e.id, e]));
    const { loops, truncated } = findLoops(edges, pack);
    const key = ids => ids.slice().sort().join('\u0000');
    const all = new Map(loops.map(l => [key(l.edges), l]));
    const warnings = [];
    for (const g of spec.groups || []) {
      if (!g || !Array.isArray(g.edges) || !(g.type === 'R' || g.type === 'B' || g.type == null)) continue;
      const k = key(g.edges), found = all.get(k);
      if (found) {
        if (g.type && g.type !== found.type) warnings.push(`grupo ${g.id}: dice ${g.type} pero sus signos dan ${found.type}`);
        all.set(k, Object.assign({}, found, { id: g.id, label: g.label, summary: g.summary, goal: g.goal, sensor: g.sensor, actuator: g.actuator, authored: true }));
      } else if (g.type) {
        const known = g.edges.map(id => byId.get(id)).filter(Boolean);
        all.set(k, { id: g.id, label: g.label, summary: g.summary, goal: g.goal, sensor: g.sensor, actuator: g.actuator, authored: true, type: g.type,
          edges: g.edges.slice(), nodes: known.map(e => e.from), delay: known.some(e => effective(e, pack).delay) });
        warnings.push(`grupo ${g.id}: sus aristas no cierran un ciclo con polaridad`);
      }
    }
    const count = { R: 0, B: 0 };
    const list = [...all.values()].map(l => {
      const n = ++count[l.type];
      return Object.assign({ id: 'loop:' + l.type + n, tag: l.type + n }, l, { tag: l.type + n, oscillates: l.type === 'B' && l.delay });
    });
    list.forEach(l => {
      if (l.oscillates) warnings.push(`${l.tag}${l.label ? ' «' + l.label + '»' : ''}: equilibra con retraso, riesgo de oscilación`);
      if (l.type === 'B' && l.authored && !l.goal) warnings.push(`${l.tag}${l.label ? ' «' + l.label + '»' : ''}: un bucle que equilibra necesita goal`);
    });
    if (truncated) warnings.push(`hay más bucles de los que se enumeran (máximo ${MAX_LOOPS}, de hasta ${MAX_LEN} aristas)`);
    return { loops: list, warnings, pack };
  }

  const CSS = `
.gx-pol { font: 700 12px/1 system-ui, sans-serif; fill: var(--gx-ink); paint-order: stroke; stroke: var(--gx-bg, #fff); stroke-width: 3px; pointer-events: none; }
.gx-pol.neg { fill: var(--gx-del, #cf222e); }
.gx-delay { stroke: var(--gx-ink); stroke-width: 1.6; pointer-events: none; }
.gx-loop { cursor: pointer; }
.gx-loop circle.ring { fill: var(--gx-bg, #fff); stroke: var(--gx-neu); stroke-width: 1.4; }
.gx-loop path.arc { fill: none; stroke: var(--gx-neu); stroke-width: 1.4; }
.gx-loop text { font: 700 11px/1 system-ui, sans-serif; fill: var(--gx-ink); text-anchor: middle; }
.gx-loop.R circle.ring, .gx-loop.R path.arc { stroke: #bc4c00; }
.gx-loop.B circle.ring, .gx-loop.B path.arc { stroke: #0969da; }
.gx-loop .osc { fill: #d29922; } .gx-loop .osc-t { font-size: 9px; fill: #fff; }
.gx-loop:hover circle.ring, .gx-loop.on circle.ring { stroke-width: 2.6; }
.gx-lg-loops li { cursor: pointer; } .gx-lg-loops b { display: inline-block; min-width: 2.2em; }
.gx-sys-p { margin: 6px 0; font-size: 12px; } .gx-sys-p dt { font-weight: 600; } .gx-sys-p dd { margin: 0 0 4px; }
.gx-sys-p .warn { color: #9a6700; }
`;
  let cssDone = false;
  function injectCSS() {
    if (cssDone || typeof document === 'undefined') return;
    cssDone = true;
    if (document.querySelector('style[data-gx-sys]')) return;
    const st = document.createElement('style'); st.setAttribute('data-gx-sys', '1'); st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* las aristas que vuelven atrás son una curva (M … C …) sin lista de puntos: se muestrea */
  function sample(d) {
    const n = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/g) || []).map(Number), P = [];
    for (let i = 0; i + 1 < n.length; i += 2) P.push({ x: n[i], y: n[i + 1] });
    if (!/C/.test(d) || P.length !== 4) return P;
    const [a, b, c, e] = P, out = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12, u = 1 - t;
      out.push({ x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * e.x, y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * e.y });
    }
    return out;
  }

  function create(A) {
    const { spec, S, M, s, esc, world, legend, lang } = A;
    const L = STR[lang] || STR.en;
    const { loops, pack } = analyze(spec);
    const hasPol = (spec.edges || []).some(e => effective(e, pack).polarity);
    if (!loops.length && !hasPol) return null;
    injectCSS();
    const loopsOf = new Map();
    loops.forEach(l => l.nodes.forEach(id => { if (!loopsOf.has(id)) loopsOf.set(id, []); loopsOf.get(id).push(l); }));
    const name = l => `${l.tag}${l.label ? ' ' + l.label : ''}`;

    const gLoops = s('g', { class: 'gx-loops' }, world);
    let pinned = null;

    /* el signo va junto a la punta y el retraso cruza el tramo más largo, donde no tapa nada */
    function edge(g, v, path) {
      const pts = (path && path.pts) || (path && path.d && sample(path.d)); if (!pts || pts.length < 2) return;
      const ef = v.list.map(e => effective(e, pack));
      const pols = [...new Set(ef.map(x => x.polarity).filter(Boolean))];
      if (pols.length === 1) {
        const a = pts[pts.length - 2], b = pts[pts.length - 1], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len, back = Math.min(16, len / 2);
        const t = s('text', { class: 'gx-pol' + (pols[0] === '-' ? ' neg' : ''), x: b.x - ux * back - uy * 9, y: b.y - uy * back + ux * 9 + 4, 'text-anchor': 'middle' }, g);
        t.textContent = pols[0] === '-' ? '−' : '+';
      }
      if (ef.some(x => x.delay)) {
        let best = 0, bi = 0;
        for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); if (d > best) { best = d; bi = i; } }
        const a = pts[bi - 1], b = pts[bi], ux = (b.x - a.x) / (best || 1), uy = (b.y - a.y) / (best || 1), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        [-2.5, 2.5].forEach(o => s('line', { class: 'gx-delay', x1: mx + ux * o - uy * 7, y1: my + uy * o + ux * 7, x2: mx + ux * o + uy * 7, y2: my + uy * o - ux * 7 }, g));
      }
    }

    const vedgeIds = l => new Set(l.edges.map(eid => { const v = S.vedges.find(x => x.list.some(e => e.id === eid)); return v && v.id; }).filter(Boolean));
    function light(l) {
      gLoops.querySelectorAll('.gx-loop').forEach(el => el.classList.toggle('on', !!l && el.getAttribute('data-loop') === l.id));
      A.lightSet(l ? { nodes: new Set(l.nodes.map(A.repOf).filter(x => x != null)), edges: vedgeIds(l) } : null);
    }

    /* el glifo va en el centro del bucle y solo si todas sus piezas se ven: plegado, el bucle no se dibuja
       a medias sobre una pieza que lo contiene entero */
    function afterLayout() {
      while (gLoops.firstChild) gLoops.removeChild(gLoops.firstChild);
      for (const l of loops) {
        const rs = l.nodes.map(id => S.visible.has(id) && S.rects.get(id));
        if (!rs.length || rs.some(r => !r)) continue;
        const cx = rs.reduce((a, r) => a + r.x + r.w / 2, 0) / rs.length;
        let cy = rs.reduce((a, r) => a + r.y + r.h / 2, 0) / rs.length;
        /* el centro de un bucle cae a menudo sobre una pieza: se sube hasta quedar libre */
        const hits = y => [...S.visible].some(id => { const r = S.rects.get(id), n = M.get(id); return r && n && !n.children.length && cx > r.x - 18 && cx < r.x + r.w + 18 && y > r.y - 18 && y < r.y + r.h + 18; });
        for (let k = 0; k < 12 && hits(cy); k++) cy -= 14;
        const g = s('g', { class: `gx-loop ${l.type}`, 'data-loop': l.id, transform: `translate(${cx},${cy})`, tabindex: 0, role: 'button' }, gLoops);
        s('title', null, g).textContent = `${name(l)} · ${L[l.type]}${l.oscillates ? ' · ' + L.osc : ''}${l.goal ? ' · ' + L.goal + ': ' + l.goal : ''}`;
        s('circle', { class: 'ring', r: 15 }, g);
        s('path', { class: 'arc', d: 'M -8 -8 A 11.3 11.3 0 1 1 -10.5 4' }, g);
        s('path', { class: 'arc', d: 'M -10.5 4 l -2.5 -4 M -10.5 4 l 4 -1.5' }, g);
        const t = s('text', { y: 4 }, g); t.textContent = l.tag;
        if (l.oscillates) { s('circle', { class: 'osc', cx: 12, cy: -12, r: 6 }, g); const w = s('text', { class: 'osc-t', x: 12, y: -9 }, g); w.textContent = '!'; }
        g.addEventListener('mouseenter', () => { if (!pinned) light(l); });
        g.addEventListener('mouseleave', () => { if (!pinned) light(null); });
        g.addEventListener('click', ev => { ev.stopPropagation(); pinned = pinned === l ? null : l; light(pinned); });
        g.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pinned = pinned === l ? null : l; light(pinned); } });
      }
      if (pinned) light(pinned);
    }

    if (legend) {
      const rows = [`<li><svg viewBox="0 0 36 10"><path class="gx-lg-e" d="M2 5h32"/><line class="gx-delay" x1="16" y1="1" x2="16" y2="9"/><line class="gx-delay" x1="20" y1="1" x2="20" y2="9"/></svg>${esc(L.delay)}</li>`,
        `<li>${esc(L.pol)}</li>`];
      const lst = loops.map(l => `<li data-loop="${esc(l.id)}"><b>${esc(l.tag)}</b>${esc(l.label || L[l.type])}${l.oscillates ? ' ⚠' : ''}</li>`).join('');
      legend.insertAdjacentHTML('beforeend', `<ul>${rows.join('')}</ul>${lst ? `<h4>${esc(L.loops)}</h4><ul class="gx-lg-loops">${lst}</ul>` : ''}`);
      legend.querySelectorAll('.gx-lg-loops li').forEach(li => {
        const l = loops.find(x => x.id === li.getAttribute('data-loop'));
        li.addEventListener('mouseenter', () => { if (!pinned) light(l); });
        li.addEventListener('mouseleave', () => { if (!pinned) light(null); });
        li.addEventListener('click', () => { pinned = pinned === l ? null : l; light(pinned); });
      });
    }

    /* en el panel: a qué bucles pertenece y qué persigue, declarado frente a observado */
    function panelTop(n) {
      if (!n) return '';
      const rows = [];
      if (n.purpose) rows.push(`<dt>${esc(L.purpose)}</dt><dd>${esc(n.purpose)}</dd>`);
      if (n.statedPurpose) rows.push(`<dt>${esc(L.stated)}</dt><dd>${esc(n.statedPurpose)}</dd>`);
      if (n.observedPurpose) rows.push(`<dt>${esc(L.observed)}</dt><dd>${esc(n.observedPurpose)}</dd>`);
      if (n.statedPurpose && n.observedPurpose && n.statedPurpose.trim() !== n.observedPurpose.trim()) rows.push(`<dd class="warn">≠ ${esc(L.mismatch)}</dd>`);
      const ls = loopsOf.get(n.id) || [];
      if (ls.length) rows.push(`<dt>${esc(L.inLoops)}</dt>` + ls.map(l => `<dd>${esc(name(l))} · ${esc(L[l.type])}${l.oscillates ? ` <span class="warn">⚠ ${esc(L.osc)}</span>` : ''}${l.type === 'B' ? (l.goal ? ` · ${esc(L.goal)}: ${esc(l.goal)}` : l.authored ? ` <span class="warn">${esc(L.noGoal)}</span>` : '') : ''}</dd>`).join(''));
      return rows.length ? `<dl class="gx-sys-p">${rows.join('')}</dl>` : '';
    }

    return { edge, afterLayout, panelTop, loops, destroy: () => gLoops.remove() };
  }

  return { create, analyze, findLoops, effective, version: '1.0.0' };
});
