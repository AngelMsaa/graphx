#!/usr/bin/env node
/* Compara un mapa generado con uno de referencia: precisión, cobertura y F1 de piezas y aristas.
 *
 *   node tools/eval.mjs <candidato>.json <oro>.json [--json]
 *
 * Las piezas casan por etiqueta normalizada (minúsculas, sin acentos ni puntuación) y, si no, por solape de
 * raíces de palabra (Jaccard ≥ 0.5), de mayor a menor solape, una con una. Las aristas casan si sus dos extremos casan,
 * en el mismo sentido; el tipo se puntúa aparte. Los carriles no cuentan.                                    */
import fs from 'node:fs';

const [candPath, goldPath] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!candPath || !goldPath) { console.error('uso: node tools/eval.mjs <candidato>.json <oro>.json [--json]'); process.exit(1); }
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const cand = read(candPath), gold = read(goldPath);

const STOP = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'for', 'and', 'with', 'plus', 'from', 'by', 'el', 'la', 'los', 'las', 'de', 'del', 'en', 'y', 'un', 'una', 'al', 'su', 'sus', 'con', 'por', 'para']);
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// las cinco primeras letras bastan para que «firma» y «firmado», o «specialist» y «specialists», casen sin un lematizador
const words = s => new Set(norm(s).split(' ').filter(w => w && !STOP.has(w)).map(w => w.slice(0, 5)));
const jaccard = (a, b) => { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let i = 0; A.forEach(w => { if (B.has(w)) i++; }); return i / (A.size + B.size - i); };
const nodesOf = s => (s.nodes || []).filter(n => !n.isLane);

function matchNodes(C, G) {
  const pairs = [];
  C.forEach(c => G.forEach(g => { const sc = norm(c.label) === norm(g.label) ? 1 : jaccard(c.label, g.label); if (sc >= 0.5) pairs.push([sc, c, g]); }));
  pairs.sort((x, y) => y[0] - x[0]);
  const c2g = new Map(), used = new Set();
  for (const [, c, g] of pairs) if (!c2g.has(c.id) && !used.has(g.id)) { c2g.set(c.id, g); used.add(g.id); }
  return c2g;
}
const prf = (tp, nc, ng) => { const p = nc ? tp / nc : 0, r = ng ? tp / ng : 0; return { precision: +p.toFixed(3), recall: +r.toFixed(3), f1: +(p + r ? 2 * p * r / (p + r) : 0).toFixed(3), tp, candidate: nc, gold: ng }; };

const C = nodesOf(cand), G = nodesOf(gold), c2g = matchNodes(C, G);
const kindOk = [...c2g].filter(([cid, g]) => C.find(c => c.id === cid).kind === g.kind).length;
const gEdges = new Map((gold.edges || []).map(e => [e.from + '>' + e.to, e]));
let etp = 0, ekind = 0;
const missingEdges = new Set(gEdges.keys());
for (const e of cand.edges || []) {
  const a = c2g.get(e.from), b = c2g.get(e.to), key = a && b && a.id + '>' + b.id;
  if (key && gEdges.has(key) && missingEdges.has(key)) { etp++; missingEdges.delete(key); if (gEdges.get(key).kind === e.kind) ekind++; }
}
const matchedGold = new Set([...c2g.values()].map(g => g.id));
const report = {
  nodes: prf(c2g.size, C.length, G.length),
  edges: prf(etp, (cand.edges || []).length, (gold.edges || []).length),
  kindAccuracy: { nodes: c2g.size ? +(kindOk / c2g.size).toFixed(3) : 0, edges: etp ? +(ekind / etp).toFixed(3) : 0 },
  extraNodes: C.filter(c => !c2g.has(c.id)).map(c => c.label),
  missingNodes: G.filter(g => !matchedGold.has(g.id)).map(g => g.label),
};
if (process.argv.includes('--json')) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }
const line = (k, r) => console.log(`${k.padEnd(6)} precisión ${r.precision.toFixed(2)}  cobertura ${r.recall.toFixed(2)}  F1 ${r.f1.toFixed(2)}  (${r.tp} de ${r.candidate} generadas, ${r.gold} en el oro)`);
line('piezas', report.nodes); line('aristas', report.edges);
console.log(`tipo correcto: piezas ${report.kindAccuracy.nodes.toFixed(2)} · aristas ${report.kindAccuracy.edges.toFixed(2)}`);
if (report.extraNodes.length) console.log(`de más: ${report.extraNodes.join(' · ')}`);
if (report.missingNodes.length) console.log(`faltan: ${report.missingNodes.join(' · ')}`);
