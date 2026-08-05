#!/usr/bin/env node
/**
 * Servidor estático mínimo, sem dependências.
 * Uso: npm start  (ou: node tools/serve.mjs [porta])
 *
 * Serve para testar o app com service worker, que não funciona em file://.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(process.argv[2] && !/^\d+$/.test(process.argv[2]) ? process.argv[2] : '.');
const PORT = Number(process.argv.find(a => /^\d+$/.test(a)) || process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip'
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(ROOT, rel);

    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('403');
      return;
    }

    const info = await stat(file).catch(() => null);
    if (info && info.isDirectory()) file = join(file, 'index.html');

    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/'
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 — não encontrado');
  }
});

server.listen(PORT, () => {
  console.log(`CONVRT servindo ${ROOT}`);
  console.log(`→ http://localhost:${PORT}`);
});
