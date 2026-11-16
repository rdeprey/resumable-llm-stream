import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export const words = ['The ', 'browser ', 'went ', 'offline. ', 'Meanwhile, ', 'the ', 'server ', 'kept ', 'the ', 'rest ', 'of ', 'the ', 'answer.'];
async function* simulatedModel() {
  for (const word of words) {
    await sleep(800);
    yield word;
  }
}

export function createLab(filename, model = simulatedModel) {
  const db = new DatabaseSync(filename);
  db.exec(`CREATE TABLE IF NOT EXISTS events (
    id TEXT, seq INTEGER, kind TEXT, text TEXT, PRIMARY KEY(id, seq)
  )`);
  const insert = db.prepare('INSERT INTO events VALUES (?, ?, ?, ?)');
  const history = db.prepare('SELECT seq, kind, text FROM events WHERE id=? AND seq>? ORDER BY seq');
  async function generate(id) {
    let seq = 0;
    try {
      for await (const text of model()) insert.run(id, ++seq, 'chunk', text);
      insert.run(id, ++seq, 'done', '');
    } catch {
      insert.run(id, ++seq, 'error', 'Generation failed');
    }
  }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/runs') {
      const id = randomUUID();
      insert.run(id, 0, 'start', '');
      void generate(id);
      return res.end(JSON.stringify({ id }));
    }
    const file = { '/': 'index.html', '/client.mjs': 'docs/client.mjs' }[url.pathname];
    if (typeof file === 'string') {
      res.setHeader('Content-Type', file.endsWith('html') ? 'text/html; charset=utf-8' : 'text/javascript');
      return res.end(await readFile(new URL(file, import.meta.url)));
    }
    const id = url.searchParams.get('id');
    if (!db.prepare('SELECT 1 FROM events WHERE id=? AND seq=0').get(id)) {
      res.writeHead(404).end();
      return;
    }
    if (url.pathname === '/log') return res.end(JSON.stringify(history.all(id, -1)));
    if (url.pathname !== '/events') return res.writeHead(404).end();
    let after = Number(url.searchParams.get('after'));
    if (!Number.isSafeInteger(after) || after < 0) return res.writeHead(400).end();
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' });
    res.flushHeaders();
    while (!res.destroyed) {
      for (const event of history.all(id, after)) {
        res.write(JSON.stringify(event) + '\n');
        after = event.seq;
        if (event.kind !== 'chunk') return res.end();
      }
      await sleep(40);
    }
  });
  server.on('close', () => db.close());
  return server;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  createLab('stream-lab.sqlite').listen(4173, '127.0.0.1', () => console.log('Open http://127.0.0.1:4173'));
}
