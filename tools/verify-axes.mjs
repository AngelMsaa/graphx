#!/usr/bin/env node
/* Comprueba el layout `axes` de graphx-layouts.js: cada pieza en su celda o en su punto, sin pisarse, y
 * los avisos del builder para bandas que no existen. Sin navegador.  node tools/verify-axes.mjs */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const box = {}; box.globalThis = box;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'graphx-layouts.js'), 'utf8'), box);
const L = box.GraphX.layouts;
let fails = 0;
const expect = (what, ok, detail) => { if (!ok) fails++; console.log(`${ok ? '✓' : '✗'} ${what}${ok ? '' : ': ' + detail}`); };

function run(spec) {
  const M = new Map(spec.nodes.map(n => [n.id, { ...n, children: [] }]));
  spec.nodes.forEach(n => { if (n.parent) M.get(n.parent).children.push(n.id); });
  const roots = spec.nodes.filter(n => !n.parent).map(n => n.id);
  return L.axes({ M, roots, vis: new Set(M.keys()), exp: new Set(), vedges: [], size: () => ({ w: 120, h: 40 }), textW: s => s.length * 6, spec, lang: 'en', cvar: () => null });
}
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const noOverlap = rects => { const r = [...rects.values()]; return r.every((a, i) => r.slice(i + 1).every(b => !overlap(a, b))); };

const band = (id) => ({ id, label: id });
const grid = run({ axes: { x: { bands: [band('l'), band('r')] }, y: { bands: [band('t'), band('b')] } },
  nodes: [['tl', 'l', 't'], ['tr', 'r', 't'], ['bl', 'l', 'b'], ['br', 'r', 'b'], ['tl2', 'l', 't']].map(([id, x, y]) => ({ id, at: { x, y } })) });
const R = id => grid.rects.get(id);
expect('ordinal 2×2: left band is left of right band', R('tl').x + R('tl').w <= R('tr').x && R('bl').x + R('bl').w <= R('br').x, JSON.stringify([R('tl'), R('tr')]));
expect('ordinal 2×2: top band is above bottom band', R('tl').y + R('tl').h <= R('bl').y && R('tr').y + R('tr').h <= R('br').y, JSON.stringify([R('tl'), R('bl')]));
expect('ordinal 2×2: two pieces in one cell do not overlap', noOverlap(grid.rects), 'overlap');

const cont = run({ axes: { preset: 'wardley' }, nodes: [{ id: 'a', at: { x: 0.1, y: 0.9 } }, { id: 'b', at: { x: 0.9, y: 0.1 } }, { id: 'c', at: { x: 0.1, y: 0.9 } }, { id: 'd' }] });
const C = id => cont.rects.get(id);
expect('continuous: low x is left, high y is up', C('a').x < C('b').x && C('a').y < C('b').y, JSON.stringify([C('a'), C('b')]));
expect('continuous: same point does not overlap', noOverlap(cont.rects), 'overlap');
expect('continuous: a piece without at is still placed', !!C('d'), 'missing');

const mixed = run({ axes: { x: { range: [0, 10] }, y: { bands: [band('u'), band('v')] } }, nodes: [{ id: 'p', at: { x: 2, y: 'u' } }, { id: 'q', at: { x: 2, y: 'u' } }, { id: 's', at: { x: 9, y: 'v' } }] });
const X = id => mixed.rects.get(id);
expect('mixed: band u above band v', Math.max(X('p').y + X('p').h, X('q').y + X('q').h) <= X('s').y, JSON.stringify([X('p'), X('q'), X('s')]));
expect('mixed: same value in one band stacks', noOverlap(mixed.rects), 'overlap');

const bad = path.join(process.env.TMPDIR || '/tmp', 'gx-axes-bad.json');
fs.writeFileSync(bad, JSON.stringify({ lang: 'en', axes: { x: { bands: [band('a')] } }, nodes: [{ id: 'n', label: 'N', summary: 's', at: { x: 'zz' } }, { id: 'm', label: 'M', summary: 's' }], edges: [] }));
let out = '';
try { out = execFileSync(process.execPath, [path.join(ROOT, 'graphx-build.mjs'), bad, '--check'], { encoding: 'utf8', stdio: 'pipe' }); } catch (e) { out = String(e.stdout) + String(e.stderr); }
expect('builder: unknown band warns', /at\.x «zz» no es una banda/.test(out), out);
expect('builder: missing at warns', /nodo m: sin at\.x/.test(out), out);

console.log(fails ? `✗ ${fails} failed` : '✓ all passed');
process.exit(fails ? 1 : 0);
