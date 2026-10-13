#!/usr/bin/env node
/* Comprueba el análisis de graphx-systems.js contra los modelos de Meadows de examples/systems: cuántos
 * bucles de cada tipo, cuáles oscilan y qué trampas salen. Sin navegador.  node tools/verify-systems.mjs */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const box = {}; box.globalThis = box;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'graphx-systems.js'), 'utf8'), box);
const sys = box.GraphX.systems;
const load = f => {
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/systems', f), 'utf8'));
  spec.pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'packs', spec.pack + '.json'), 'utf8'));
  return sys.analyze(spec);
};
let fails = 0;
const expect = (what, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const tally = r => ({ R: r.loops.filter(l => l.type === 'R').length, B: r.loops.filter(l => l.type === 'B').length });

const pop = load('population.json');
expect('population: one R, one B', tally(pop), { R: 1, B: 1 });
expect('population: names come from groups', pop.loops.map(l => l.label).sort(), ['births compound', 'deaths drain']);
expect('population: no traps', pop.traps.length, 0);

const inv = load('inventory.json');
expect('inventory: the restock loop oscillates', inv.loops.filter(l => l.oscillates).map(l => l.label), ['restock to cover']);

const traps = load('traps.json');
const lanes = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/systems/traps.json'), 'utf8')).nodes.reduce((m, n) => m.set(n.id, n.lane), new Map());
const found = traps.traps.map(t => `${[...new Set(t.nodes.map(id => lanes.get(id)))].join('+')}:${t.key}`).sort();
expect('traps: each lane raises its own trap and nothing else', found, [
  'dl:drift-to-low-performance', 'es:escalation', 'pr:policy-resistance', 'sb:shifting-the-burden', 'ss:success-to-the-successful', 'tc:tragedy-of-the-commons']);
expect('traps: leverage ranks goals before parameters', traps.leverage.map(g => g.level), [...traps.leverage.map(g => g.level)].sort((a, b) => a - b));

const big = sys.findLoops(Array.from({ length: 12 }, (_, i) => Array.from({ length: 12 }, (_, j) => i !== j && { id: `e${i}-${j}`, from: 'n' + i, to: 'n' + j, polarity: '+' })).flat().filter(Boolean), null);
expect('dense graph: enumeration stops at the cap', [big.loops.length, big.truncated], [50, true]);

console.log(fails ? `✗ ${fails} failed` : '✓ all passed');
process.exit(fails ? 1 : 0);
