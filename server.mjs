import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root) || !['.html', '.css', '.js', '.svg'].includes(path.extname(file))) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('Not found');
  }
});
server.listen(Number(process.env.PORT) || 5173, '127.0.0.1', () => console.log('Eyes is ready at http://127.0.0.1:5173'));
