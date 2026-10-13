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
      stated: 'Declarado', observed: 'Observado', mismatch: 'lo que dice perseguir no es lo que hace', goal: 'Meta', noGoal: 'sin meta: un bucle que equilibra necesita una',
      traps: 'Posibles trampas', wayOut: 'Salida', lever: 'Dónde intervenir', leverNote: 'de menos a más eficaz; cuanto más arriba, más resiste el sistema y menos obvio es el sentido',
      see: 'Ver como', seeOff: 'Dejar de ver como', seeNote: 'gris: lo que este actor no ve ni toca',
      agg: 'Acumulado', aggTo: 'hasta aquí, por el camino más largo', critical: 'camino crítico',
      L: { paradigm: 'paradigma', evolution: 'capacidad de cambiar la propia estructura', buffers: 'amortiguadores', goals: 'metas', rules: 'reglas', info: 'flujos de información', reinforcing: 'ganancia de los bucles que refuerzan', balancing: 'fuerza de los bucles que equilibran', delays: 'retrasos', stocks: 'estructura de stocks y flujos', params: 'parámetros' } },
    en: { R: 'reinforcing loop', B: 'balancing loop', delay: 'delay', pol: '+ same direction · − opposite direction', loops: 'Loops',
      osc: 'oscillation risk: a balancing loop with a delay overshoots', inLoops: 'In loops', purpose: 'Purpose',
      stated: 'Stated', observed: 'Observed', mismatch: 'what it says it pursues is not what it does', goal: 'Goal', noGoal: 'no goal: a balancing loop needs one',
      traps: 'Possible traps', wayOut: 'Way out', lever: 'Where to intervene', leverNote: 'most effective first; the higher the point, the more the system resists and the less obvious the direction',
      see: 'See as', seeOff: 'Stop seeing as', seeNote: 'grey: what this actor neither sees nor touches',
      agg: 'Accumulated', aggTo: 'to here, along the longest path', critical: 'critical path',
      L: { paradigm: 'paradigm', evolution: 'power to change its own structure', buffers: 'buffers', goals: 'goals', rules: 'rules', info: 'information flows', reinforcing: 'gain of reinforcing loops', balancing: 'strength of balancing loops', delays: 'delays', stocks: 'stock and flow structure', params: 'parameters' } }
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
    const traps = findTraps(spec, pack, list);
    traps.forEach(t => warnings.push(`posible trampa «${t.name}»: ${t.why}`));
    const aggs = (Array.isArray(spec.aggregates) ? spec.aggregates : []).filter(a => a && a.field).map(a => aggregate(spec, a));
    return { loops: list, traps, leverage: leverage(spec, pack, list), aggregates: aggs, warnings, pack };
  }

  /* `aggregates: [{ field, label, unit }]`: la suma de un número a lo largo del camino más largo que llega a
     cada pieza (el plazo de una cadena de valor, el coste acumulado). Cuenta lo que lleva la pieza y lo que
     lleva cada arista. Un ciclo no suma dos veces. */
  function aggregate(spec, a) {
    const f = a.field, num = x => (x && typeof x[f] === 'number' && isFinite(x[f]) ? x[f] : 0);
    const nodes = new Map((spec.nodes || []).map(n => [n.id, n])), into = new Map();
    (spec.edges || []).forEach(e => { if (nodes.has(e.from) && nodes.has(e.to)) { if (!into.has(e.to)) into.set(e.to, []); into.get(e.to).push(e); } });
    /* las aristas de vuelta se descartan antes de sumar, recorriendo desde las raíces en el orden del spec,
       para que el corte no dependa de por qué pieza empiece la memoria */
    const back = new Set(), state = new Map(), outOf = new Map();
    (spec.edges || []).forEach(e => { if (nodes.has(e.from) && nodes.has(e.to)) { if (!outOf.has(e.from)) outOf.set(e.from, []); outOf.get(e.from).push(e); } });
    const dfs = id => { state.set(id, 1); for (const e of outOf.get(id) || []) { const s = state.get(e.to); if (s === 1) back.add(e); else if (!s) dfs(e.to); } state.set(id, 2); };
    [...nodes.keys()].sort((x, y) => (into.has(x) ? 1 : 0) - (into.has(y) ? 1 : 0)).forEach(id => { if (!state.get(id)) dfs(id); });
    const memo = new Map(), via = new Map();
    const at = id => {
      if (memo.has(id)) return memo.get(id);
      let best = 0, how = null;
      for (const e of into.get(id) || []) { if (back.has(e)) continue; const v = at(e.from) + num(e); if (v > best) { best = v; how = e; } }
      const v = best + num(nodes.get(id)); memo.set(id, v); via.set(id, how); return v;
    };
    nodes.forEach((_, id) => at(id));
    let end = null; memo.forEach((v, id) => { if (end == null || v > memo.get(end)) end = id; });
    const path = { nodes: [], edges: [] };
    for (let x = end; x != null; ) { path.nodes.unshift(x); const e = via.get(x); if (!e) break; path.edges.unshift(e.id); x = e.from; }
    return { field: f, label: a.label || f, unit: a.unit || '', at: memo, total: end != null ? memo.get(end) : 0, path };
  }

  /* papel de una pieza en el modelo: el que su tipo declare en el paquete (`role`), si no el propio tipo */
  const roleOf = (n, pack) => (n && ((pack && pack.nodeKinds && pack.nodeKinds[n.kind] && pack.nodeKinds[n.kind].role) || n.kind)) || null;
  const catOf = (n, pack) => (n && (n.category || (pack && pack.nodeKinds && pack.nodeKinds[n.kind] && pack.nodeKinds[n.kind].category))) || null;

  /* Las trampas de Meadows (cap. 5) que se reconocen por su forma. Son sospechas: la forma coincide, el
     juicio de si el sistema cae en ella es de quien lee. Cada una trae su salida. */
  const TRAPS = {
    'policy-resistance': { es: 'resistencia a las políticas', en: 'policy resistance',
      out: { es: 'alinear las metas de los actores, o soltar y buscar una meta común', en: 'align the actors\' goals, or let go and find a goal everyone shares' } },
    'shifting-the-burden': { es: 'desplazar la carga', en: 'shifting the burden',
      out: { es: 'reforzar la capacidad propia del sistema antes de retirar el alivio', en: 'build the system\'s own capacity, then withdraw the symptomatic fix' } },
    'success-to-the-successful': { es: 'éxito para el exitoso', en: 'success to the successful',
      out: { es: 'diversificar, limitar lo que se lleva el ganador o nivelar el terreno', en: 'diversify, cap the winner\'s share, or level the field' } },
    'drift-to-low-performance': { es: 'deriva hacia el bajo rendimiento', en: 'drift to low performance',
      out: { es: 'fijar la meta en absoluto, o atarla a los mejores resultados y no a los peores', en: 'keep the goal absolute, or peg it to the best results instead of the worst' } },
    'escalation': { es: 'escalada', en: 'escalation',
      out: { es: 'desarmarse por una de las partes, o negociar un bucle que equilibre', en: 'one side steps back, or negotiate a balancing loop' } },
    'rule-beating': { es: 'esquivar las reglas', en: 'rule beating',
      out: { es: 'rediseñar la regla para que lo que esquiva sea lo que se buscaba', en: 'redesign the rule so that the evasion is what the rule was after' } },
    'seeking-the-wrong-goal': { es: 'perseguir la meta equivocada', en: 'seeking the wrong goal',
      out: { es: 'medir lo que de verdad importa, no lo fácil de medir', en: 'measure what actually matters, not what is easy to count' } },
    'tragedy-of-the-commons': { es: 'tragedia de los comunes', en: 'tragedy of the commons',
      out: { es: 'devolver a cada usuario la señal del recurso común: educar, regular o repartir', en: 'feed the state of the commons back to each user: educate, regulate or divide it' } }
  };
  function findTraps(spec, pack, loops) {
    const nodes = new Map((spec.nodes || []).map(n => [n.id, n])), edges = spec.edges || [];
    const pol = e => effective(e, pack).polarity;
    const isStock = id => roleOf(nodes.get(id), pack) === 'stock';
    const B = loops.filter(l => l.type === 'B'), R = loops.filter(l => l.type === 'R');
    const out = [], seen = new Set();
    const add = (key, members, why) => {
      const k = key + ':' + [...new Set(members.nodes)].sort().join(',');
      if (seen.has(k)) return; seen.add(k);
      out.push({ id: k, key, name: TRAPS[key].es, nodes: [...new Set(members.nodes)], edges: [...new Set(members.edges || [])], why });
    };
    const both = (a, b) => ({ nodes: a.nodes.concat(b.nodes), edges: a.edges.concat(b.edges) });
    /* un stock al que tiran dos bucles que equilibran con metas distintas */
    for (const id of nodes.keys()) {
      if (!isStock(id)) continue;
      const pulls = B.filter(l => l.nodes.includes(id) && l.goal);
      const goals = new Set(pulls.map(l => l.goal.trim().toLowerCase()));
      if (goals.size > 1) add('policy-resistance', { nodes: pulls.flatMap(l => l.nodes), edges: pulls.flatMap(l => l.edges) }, `${pulls.map(l => l.tag).join(' y ')} empujan ${nodes.get(id).label} hacia metas distintas`);
    }
    for (let i = 0; i < loops.length; i++) for (let j = 0; j < loops.length; j++) {
      if (i === j) continue;
      const a = loops[i], b = loops[j], shared = a.nodes.filter(x => b.nodes.includes(x));
      const onlyA = a.nodes.filter(x => !b.nodes.includes(x)), onlyB = b.nodes.filter(x => !a.nodes.includes(x));
      /* dos arreglos del mismo síntoma, y el rápido daña al de fondo */
      if (a.type === 'B' && b.type === 'B' && shared.length) {
        const side = edges.find(e => pol(e) === '-' && onlyA.includes(e.from) && onlyB.includes(e.to));
        if (side) add('shifting-the-burden', { nodes: both(a, b).nodes, edges: both(a, b).edges.concat(side.id) }, `${a.tag} alivia el síntoma y, por ${side.id}, debilita ${b.tag}`);
      }
      /* dos bucles que refuerzan compitiendo por lo mismo: lo que da a uno se lo quita al otro */
      if (a.type === 'R' && b.type === 'R' && i < j) {
        for (const x of new Set(a.nodes.concat(b.nodes))) {
          const toA = edges.find(e => e.from === x && pol(e) === '+' && onlyA.includes(e.to)), toB = edges.find(e => e.from === x && pol(e) === '-' && onlyB.includes(e.to));
          const toA2 = edges.find(e => e.from === x && pol(e) === '-' && onlyA.includes(e.to)), toB2 = edges.find(e => e.from === x && pol(e) === '+' && onlyB.includes(e.to));
          if ((toA && toB) || (toA2 && toB2)) { add('success-to-the-successful', both(a, b), `${a.tag} y ${b.tag} se reparten ${(nodes.get(x) || { label: x }).label}: lo que gana uno lo pierde el otro`); break; }
        }
      }
    }
    /* una meta que está dentro del bucle que gobierna: el rendimiento real la va moviendo */
    for (const l of loops) {
      const g = l.nodes.find(id => roleOf(nodes.get(id), pack) === 'goal');
      if (g) add('drift-to-low-performance', l, `la meta ${nodes.get(g).label} se ajusta a lo que ${l.tag} consigue`);
    }
    /* un bucle que refuerza entre stocks de dueños distintos: cada uno responde al otro con más */
    for (const l of R) {
      const owners = new Set(l.nodes.filter(isStock).map(id => nodes.get(id).owner).filter(Boolean));
      if (owners.size > 1) add('escalation', l, `${l.tag} encadena los stocks de ${[...owners].join(' y ')}`);
    }
    /* un recurso común que vacían varios dueños, cada uno con su propio crecimiento */
    for (const id of nodes.keys()) {
      if (!isStock(id)) continue;
      const drains = edges.filter(e => e.to === id && pol(e) === '-' && nodes.get(e.from));
      const owners = new Set(drains.map(e => nodes.get(e.from).owner).filter(Boolean));
      const growing = drains.filter(e => R.some(l => l.nodes.includes(e.from) && !l.nodes.includes(id)));
      if (owners.size > 1 && growing.length > 1) add('tragedy-of-the-commons', { nodes: [id, ...drains.map(e => e.from)], edges: drains.map(e => e.id) }, `${nodes.get(id).label} lo vacían ${[...owners].join(', ')} y ninguno ve en su crecimiento lo que queda`);
    }
    /* una regla que empuja algo en un sentido y, a través de cómo responde un actor, en el contrario */
    const sgn = e => (pol(e) === '-' ? -1 : 1);
    for (const r of nodes.keys()) {
      if (roleOf(nodes.get(r), pack) !== 'rule') continue;
      for (const d of edges.filter(e => e.from === r && pol(e))) {
        for (const q of edges.filter(e => e.from === r && pol(e) && catOf(nodes.get(e.to), pack) === 'actor')) {
          const back = edges.find(e => e.from === q.to && e.to === d.to && pol(e) && sgn(q) * sgn(e) !== sgn(d));
          if (back) add('rule-beating', { nodes: [r, q.to, d.to], edges: [d.id, q.id, back.id] }, `${nodes.get(r).label} empuja ${(nodes.get(d.to) || { label: d.to }).label} en un sentido y la respuesta de ${nodes.get(q.to).label} lo lleva al contrario`);
        }
      }
    }
    /* una meta cuyo propósito declarado no es el que se observa: el bucle persigue el indicador */
    for (const [id, n] of nodes) {
      if (roleOf(n, pack) !== 'goal' || !n.statedPurpose || !n.observedPurpose || n.statedPurpose.trim() === n.observedPurpose.trim()) continue;
      const ls = loops.filter(l => l.nodes.includes(id) || edges.some(e => e.from === id && l.nodes.includes(e.to)));
      add('seeking-the-wrong-goal', { nodes: [id, ...ls.flatMap(l => l.nodes)], edges: ls.flatMap(l => l.edges) }, `${n.label} dice perseguir «${n.statedPurpose}» y persigue «${n.observedPurpose}»`);
    }
    return out;
  }

  /* Los doce puntos de apalancamiento (cap. 6), del menos eficaz (12) al más (1), asignados por la forma de
     cada elemento. Meadows avisa: cuanto más alto el punto, más resiste el sistema y menos obvio es el sentido. */
  function leverage(spec, pack, loops) {
    const groups = new Map();
    const put = (level, key, item) => { if (!groups.has(level)) groups.set(level, { level, key, items: [] }); groups.get(level).items.push(item); };
    // un concepto sin papel solo es parámetro si mueve algo: fuera de la red causal no hay palanca
    const causal = new Set();
    (spec.edges || []).forEach(e => { if (effective(e, pack).polarity) { causal.add(e.from); causal.add(e.to); } });
    const KEY = { 2: 'paradigm', 3: 'goals', 4: 'evolution', 5: 'rules', 6: 'info', 9: 'delays', 10: 'stocks', 11: 'buffers', 12: 'params' };
    for (const n of spec.nodes || []) {
      const r = roleOf(n, pack), c = catOf(n, pack);
      /* `leverage` en la pieza manda: el autor sabe que ese stock es un amortiguador o esa regla, un paradigma */
      if (KEY[n.leverage]) put(n.leverage, KEY[n.leverage], { node: n.id, label: n.label });
      else if (r === 'paradigm') put(2, 'paradigm', { node: n.id, label: n.label });
      else if (r === 'evolution') put(4, 'evolution', { node: n.id, label: n.label });
      else if (r === 'goal') put(3, 'goals', { node: n.id, label: n.label });
      else if (r === 'rule') put(5, 'rules', { node: n.id, label: n.label });
      else if (r === 'stock') put(n.buffer ? 11 : 10, n.buffer ? 'buffers' : 'stocks', { node: n.id, label: n.label });
      else if (r === 'variable' || (c === 'concept' && r !== 'cloud' && causal.has(n.id))) put(12, 'params', { node: n.id, label: n.label });
    }
    for (const e of spec.edges || []) {
      const ef = effective(e, pack);
      if (KEY[e.leverage]) put(e.leverage, KEY[e.leverage], { edge: e.id, label: e.label || `${e.from} → ${e.to}` });
      else if (ef.delay) put(9, 'delays', { edge: e.id, label: e.label || `${e.from} → ${e.to}` });
      else if (ef.polarity && (pack && pack.edgeKinds && pack.edgeKinds[e.kind] && pack.edgeKinds[e.kind].info)) put(6, 'info', { edge: e.id, label: e.label || `${e.from} → ${e.to}` });
    }
    loops.forEach(l => put(l.type === 'B' ? 8 : 7, l.type === 'B' ? 'balancing' : 'reinforcing', { loop: l.id, label: l.tag + (l.label ? ' ' + l.label : '') }));
    return [...groups.values()].sort((a, b) => a.level - b.level);
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
.gx-lg-loops li { cursor: pointer; } .gx-lg-loops li.on { font-weight: 600; } .gx-lg-loops b { display: inline-block; min-width: 2.2em; }
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
    const { loops, traps, leverage: lever, aggregates: aggs, pack } = analyze(spec);
    const hasPol = (spec.edges || []).some(e => effective(e, pack).polarity);
    if (!loops.length && !hasPol && !aggs.length) return null;
    const fmt = (v, a) => `${Math.round(v * 100) / 100}${a.unit ? ' ' + a.unit : ''}`;
    const nodeById = new Map((spec.nodes || []).map(n => [n.id, n]));
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

    /* lo que se enciende (un bucle, una trampa, un grupo de palancas, lo que ve un actor) es siempre
       { id, nodes, edges } con ids del JSON; aquí se traduce a lo que está dibujado */
    const vedgeIds = ids => new Set(ids.map(eid => { const v = S.vedges.find(x => x.list.some(e => e.id === eid)); return v && v.id; }).filter(Boolean));
    function light(x) {
      gLoops.querySelectorAll('.gx-loop').forEach(el => el.classList.toggle('on', !!x && el.getAttribute('data-loop') === x.id));
      host().querySelectorAll('[data-sys]').forEach(el => el.classList.toggle('on', !!x && el.getAttribute('data-sys') === x.id));
      A.lightSet(x ? { nodes: new Set(x.nodes.map(A.repOf).filter(y => y != null)), edges: vedgeIds(x.edges || []) } : null);
    }
    const host = () => (legend && legend.closest('.gx')) || document;
    const toggle = x => { pinned = pinned && pinned.id === x.id ? null : x; light(pinned); };
    const lightables = new Map();
    loops.forEach(l => lightables.set(l.id, l));
    traps.forEach(t => lightables.set(t.id, t));
    aggs.forEach(a => lightables.set('agg:' + a.field, { id: 'agg:' + a.field, nodes: a.path.nodes, edges: a.path.edges }));
    lever.forEach(g => lightables.set('lever:' + g.level, { id: 'lever:' + g.level,
      nodes: g.items.flatMap(i => i.node ? [i.node] : i.loop ? lightables.get(i.loop).nodes : i.edge ? (spec.edges || []).filter(e => e.id === i.edge).flatMap(e => [e.from, e.to]) : []),
      edges: g.items.flatMap(i => i.edge ? [i.edge] : i.loop ? lightables.get(i.loop).edges : []) }));
    /* racionalidad limitada: un actor decide con lo que le llega y actúa sobre lo que toca; el resto, en gris */
    const viewOf = id => {
      const es = (spec.edges || []).filter(e => e.from === id || e.to === id);
      return { id: 'view:' + id, nodes: [id, ...es.map(e => (e.from === id ? e.to : e.from))], edges: es.map(e => e.id) };
    };
    const bind = (el, x) => {
      el.addEventListener('mouseenter', () => { if (!pinned) light(x); });
      el.addEventListener('mouseleave', () => { if (!pinned) light(null); });
      el.addEventListener('click', ev => { ev.stopPropagation(); toggle(x); });
    };

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
        bind(g, l);
        g.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(l); } });
      }
      if (pinned) light(pinned);
    }

    if (legend && aggs.length) legend.insertAdjacentHTML('beforeend', `<ul class="gx-lg-loops">${aggs.map(a => `<li data-sys="agg:${esc(a.field)}" title="${esc(L.critical)}"><b>Σ</b>${esc(a.label)}: ${esc(fmt(a.total, a))}</li>`).join('')}</ul>`);
    if (legend && (loops.length || hasPol)) {
      const rows = [`<li><svg viewBox="0 0 36 10"><path class="gx-lg-e" d="M2 5h32"/><line class="gx-delay" x1="16" y1="1" x2="16" y2="9"/><line class="gx-delay" x1="20" y1="1" x2="20" y2="9"/></svg>${esc(L.delay)}</li>`,
        `<li>${esc(L.pol)}</li>`];
      const lst = loops.map(l => `<li data-sys="${esc(l.id)}"><b>${esc(l.tag)}</b>${esc(l.label || L[l.type])}${l.oscillates ? ' ⚠' : ''}</li>`).join('');
      const trp = traps.map(t => `<li data-sys="${esc(t.id)}" title="${esc(L.wayOut)}: ${esc(TRAPS[t.key].out[lang] || TRAPS[t.key].out.en)}"><b>⚠</b>${esc(TRAPS[t.key][lang] || TRAPS[t.key].en)}</li>`).join('');
      const lev = lever.map(g => `<li data-sys="lever:${g.level}" title="${esc(g.items.map(i => i.label).join(' · '))}"><b>${g.level}</b>${esc(L.L[g.key])} (${g.items.length})</li>`).join('');
      legend.insertAdjacentHTML('beforeend', `<ul>${rows.join('')}</ul>`
        + (lst ? `<h4>${esc(L.loops)}</h4><ul class="gx-lg-loops">${lst}</ul>` : '')
        + (trp ? `<h4>${esc(L.traps)}</h4><ul class="gx-lg-loops">${trp}</ul>` : '')
        + (lev ? `<h4 title="${esc(L.leverNote)}">${esc(L.lever)}</h4><ul class="gx-lg-loops">${lev}</ul>` : ''));
    }
    if (legend) legend.querySelectorAll('[data-sys]').forEach(li => { const x = lightables.get(li.getAttribute('data-sys')); if (x) bind(li, x); });

    /* en el panel: a qué bucles pertenece y qué persigue, declarado frente a observado */
    function panelTop(n) {
      if (!n) return '';
      const rows = [];
      if (n.purpose) rows.push(`<dt>${esc(L.purpose)}</dt><dd>${esc(n.purpose)}</dd>`);
      if (n.statedPurpose) rows.push(`<dt>${esc(L.stated)}</dt><dd>${esc(n.statedPurpose)}</dd>`);
      if (n.observedPurpose) rows.push(`<dt>${esc(L.observed)}</dt><dd>${esc(n.observedPurpose)}</dd>`);
      if (n.statedPurpose && n.observedPurpose && n.statedPurpose.trim() !== n.observedPurpose.trim()) rows.push(`<dd class="warn">≠ ${esc(L.mismatch)}</dd>`);
      aggs.forEach(a => { if (a.at.has(n.id)) rows.push(`<dt>${esc(a.label)}</dt><dd title="${esc(L.aggTo)}">${esc(fmt(a.at.get(n.id), a))}</dd>`); });
      const ls = loopsOf.get(n.id) || [];
      if (ls.length) rows.push(`<dt>${esc(L.inLoops)}</dt>` + ls.map(l => `<dd>${esc(name(l))} · ${esc(L[l.type])}${l.oscillates ? ` <span class="warn">⚠ ${esc(L.osc)}</span>` : ''}${l.type === 'B' ? (l.goal ? ` · ${esc(L.goal)}: ${esc(l.goal)}` : l.authored ? ` <span class="warn">${esc(L.noGoal)}</span>` : '') : ''}</dd>`).join(''));
      const ts = traps.filter(t => t.nodes.includes(n.id));
      if (ts.length) rows.push(`<dt>${esc(L.traps)}</dt>` + ts.map(t => `<dd class="warn">⚠ ${esc(TRAPS[t.key][lang] || TRAPS[t.key].en)}</dd><dd>${esc(L.wayOut)}: ${esc(TRAPS[t.key].out[lang] || TRAPS[t.key].out.en)}</dd>`).join(''));
      if (catOf(nodeById.get(n.id), pack) === 'actor') {
        const on = pinned && pinned.id === 'view:' + n.id;
        rows.push(`<dd><button type="button" class="gx-btn" data-sys-view="${esc(n.id)}" title="${esc(L.seeNote)}">👁 ${esc(on ? L.seeOff : L.see)} ${esc(n.label)}</button></dd>`);
      }
      return rows.length ? `<dl class="gx-sys-p">${rows.join('')}</dl>` : '';
    }
    if (A.panel) A.panel.addEventListener('click', ev => {
      const b = ev.target.closest && ev.target.closest('[data-sys-view]'); if (!b) return;
      ev.stopPropagation(); const id = b.getAttribute('data-sys-view'); toggle(viewOf(id));
      b.lastChild.textContent = ` ${pinned ? L.seeOff : L.see} ${(nodeById.get(id) || {}).label || id}`;
    });

    return { edge, afterLayout, panelTop, loops, destroy: () => gLoops.remove() };
  }

  return { create, analyze, findLoops, effective, aggregate, version: '1.1.0' };
});
