// A tiny static server for the render test: serves /dist and /tests/harness on localhost only.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const ALLOWED = ['/dist/', '/tests/harness/'];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const port = Number(process.env.PORT) || 4178;

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!ALLOWED.some((p) => path.startsWith(p))) { res.writeHead(404).end(); return; }
  try {
    const body = await readFile(join(ROOT, path.endsWith('/') ? `${path}index.html` : path));
    res.writeHead(200, { 'content-type': TYPES[extname(path) || '.html'] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, '127.0.0.1', () => console.log(`test server on http://127.0.0.1:${port}/tests/harness/`));
