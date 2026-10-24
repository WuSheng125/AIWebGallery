import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
// Only the site's public source files are served; scratch and output files stay private.
const publicFiles = new Set(['index.html', 'styles.css', 'app.js', 'renderer.js', 'shaders.js']);
http.createServer(async (req, res) => {
  let file;
  try { file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html'; }
  catch { res.writeHead(400).end('Bad request'); return; }
  if (!publicFiles.has(file)) { res.writeHead(404).end('Not found'); return; }
  try {
    const content = await readFile(path.join(root, file));
    res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(content);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Gargantua observatory: http://127.0.0.1:${port}`));
