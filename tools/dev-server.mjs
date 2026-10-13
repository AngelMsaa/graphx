#!/usr/bin/env node
/* Servidor de desarrollo: reconstruye un JSON con --mode dev (las fuentes sin minificar) cada vez
 * que cambia el motor o el JSON, y recarga el navegador por SSE.
 *
 *   node tools/dev-server.mjs [graph.json] [--port 5179]
 *
 * Por defecto pinta examples/angelos/angelos-map.json.                                          */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const portAt = args.indexOf('--port');
const PORT = portAt >= 0 ? +args[portAt + 1] : 5179;
const SPEC = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--port') || path.join(ROOT, 'examples/angelos/angelos-map.json'));
const OUT = path.join(ROOT, 'examples', '.dev.html');
const WATCHED = ['graphx.js', 'graphx.css', 'graphx-fx.js', 'graphx-shapes.js', 'graphx-mermaid.js', 'graphx-layouts.js', 'graphx-tree.js', 'graphx-systems.js', 'graphx-build.mjs'].map(f => path.join(ROOT, f))
  .concat(fs.readdirSync(path.join(ROOT, 'packs')).filter(f => f.endsWith('.json')).map(f => path.join(ROOT, 'packs', f)), SPEC);
const PACKS = path.join(ROOT, 'packs');

const RELOAD = `<script>new EventSource('/__reload').onmessage = () => location.reload();</script>`;
let page = '', lastError = '';
const clients = new Set();

function build() {
  const t = Date.now();
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'graphx-build.mjs'), SPEC, '--mode', 'dev', '--out', OUT], { cwd: ROOT, stdio: 'pipe' });
    page = fs.readFileSync(OUT, 'utf8').replace('</body>', RELOAD + '</body>');
    lastError = '';
    console.log(`built in ${Date.now() - t} ms`);
  } catch (e) {
    lastError = String(e.stderr || e.stdout || e.message);
    console.error(lastError);
  }
  clients.forEach(res => res.write('data: reload\n\n'));
}

let timer = null;
const schedule = () => { clearTimeout(timer); timer = setTimeout(build, 120); };
// Los editores que guardan con rename sueltan el watcher del fichero; vigilar los directorios no.
new Set(WATCHED.map(f => path.dirname(f))).forEach(dir =>
  fs.watch(dir, (_, name) => { if (name && WATCHED.includes(path.join(dir, name))) schedule(); }));
fs.watch(PACKS, (_, name) => { if (name && name.endsWith('.json')) schedule(); });

http.createServer((req, res) => {
  if (req.url === '/__reload') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write('\n'); clients.add(res); req.on('close', () => clients.delete(res));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(lastError
    ? `<!doctype html><meta charset="utf-8"><pre style="color:#c00;white-space:pre-wrap;padding:16px">${lastError.replace(/</g, '&lt;')}</pre>${RELOAD}`
    : page);
}).listen(PORT, '127.0.0.1', () => {
  build();
  console.log(`graphx dev: http://localhost:${PORT}  ·  ${path.relative(ROOT, SPEC)}`);
});
