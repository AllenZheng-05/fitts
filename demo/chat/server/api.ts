// The demo's backend: a Vite dev-server middleware with in-memory data.
// POST /api/__reset reseeds it (pnpm --filter demo-chat reset).
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { seed, type Db } from './seed';

let db: Db = seed();

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c: Buffer) => (raw += c.toString()));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;
  const method = req.method ?? 'GET';

  if (path === '/help' || path === '/help/') {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><title>Not found</title><h1>404</h1><p>Not found.</p>');
    return true;
  }
  if (!path.startsWith('/api/')) return false;

  if (path === '/api/__reset' && method === 'POST') {
    db = seed();
    json(res, 200, { ok: true });
    return true;
  }
  if (path === '/api/contacts' && method === 'GET') {
    json(res, 200, db.contacts);
    return true;
  }
  if (path === '/api/contacts' && method === 'POST') {
    const body = (await readBody(req)) as { name?: string; phone?: string };
    if (!body.name || !body.phone || !/^[0-9 ()+-]{7,}$/.test(body.phone)) {
      json(res, 422, { error: 'invalid' });
      return true;
    }
    const contact = { id: db.nextId++, name: body.name, nickname: null, phone: body.phone };
    db.contacts.push(contact);
    json(res, 201, contact);
    return true;
  }
  if (path === '/api/conversations' && method === 'GET') {
    json(res, 200, db.conversations);
    return true;
  }
  const conv = /^\/api\/conversations\/(\d+)$/.exec(path);
  if (conv) {
    const id = Number(conv[1]);
    if (method === 'GET') {
      const c = db.conversations.find((x) => x.id === id);
      if (c) json(res, 200, c);
      else json(res, 404, { error: 'not found' });
      return true;
    }
    if (method === 'DELETE') {
      db.conversations = db.conversations.filter((x) => x.id !== id);
      res.statusCode = 204;
      res.end();
      return true;
    }
  }
  if (path === '/api/messages' && method === 'POST') {
    const body = (await readBody(req)) as { to?: number; text?: string };
    if (!body.text || !body.text.trim()) {
      json(res, 400, { code: '0x3F' });
      return true;
    }
    const c = db.conversations.find((x) => x.contactId === body.to);
    const message = { from: 'You', text: body.text, at: new Date().toISOString() };
    if (c) c.messages.push(message);
    json(res, 201, message);
    return true;
  }
  if (path === '/api/search' && method === 'GET') {
    await sleep(1500);
    // Every message in the archive, every time.
    json(res, 200, { query: url.searchParams.get('q') ?? '', items: db.archive });
    return true;
  }
  json(res, 404, { error: 'not found' });
  return true;
}

export function api(): Plugin {
  return {
    name: 'demo-chat-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        handle(req, res).then(
          (handled) => {
            if (!handled) next();
          },
          (e: unknown) => next(e),
        );
      });
    },
  };
}
