// @vitest-environment node
// Live-site verification (§4.2) with a fake resolver and a local HTTP server: no network.
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { domainOf, verifyDns, verifyFile } from '../../src/agent/verify-site/verify';

const TOKEN = 'fitts-verify=AB12CD34EF';

describe('domains', () => {
  it('normalizes URLs to hostnames and rejects anything else', () => {
    expect(domainOf('https://Hartwell.example.com/about?x=1')).toBe('hartwell.example.com');
    expect(domainOf('allenzheng-05.github.io')).toBe('allenzheng-05.github.io');
    expect(domainOf('localhost:3000')).toBe('');
    expect(domainOf('not a domain')).toBe('');
  });
});

describe('DNS TXT', () => {
  it('passes with the token (bare or prefixed), fails with another or none', async () => {
    const asked: string[] = [];
    const ok = await verifyDns('example.com', TOKEN, (name) => {
      asked.push(name);
      return Promise.resolve([['v=spf1 -all'], ['AB12CD34EF']]);
    });
    expect(asked).toEqual(['_fitts-verify.example.com']);
    expect(ok.ok).toBe(true);
    expect((await verifyDns('example.com', TOKEN, () => Promise.resolve([['nope']]))).ok).toBe(
      false,
    );
    const none = await verifyDns('example.com', TOKEN, () => Promise.reject(new Error('ENODATA')));
    expect(none.ok).toBe(false);
    expect(none.message).toMatch(/couldn’t find a TXT record/);
  });
});

describe('file or meta tag', () => {
  let server: Server;
  let base = '';
  const pages = new Map<string, string>();
  beforeAll(async () => {
    server = createServer((req, res) => {
      const body = pages.get(req.url ?? '');
      res.statusCode = body === undefined ? 404 : 200;
      res.end(body ?? 'not found');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const a = server.address();
    base = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`;
  });
  afterAll(() => {
    server.close();
  });
  const get = async (url: string) => {
    const res = await fetch(url);
    return { status: res.status, text: await res.text() };
  };

  it('passes with the token file', async () => {
    pages.clear();
    pages.set('/.well-known/fitts-verify.txt', `${TOKEN}\n`);
    expect((await verifyFile('example.com', TOKEN, get, base)).ok).toBe(true);
  });

  it('passes with the meta tag on the home page', async () => {
    pages.clear();
    pages.set('/', `<html><head><meta name="fitts-verify" content="AB12CD34EF"></head></html>`);
    expect(await verifyFile('example.com', TOKEN, get, base)).toEqual({
      ok: true,
      message: 'Found the fitts-verify meta tag on your home page.',
    });
  });

  it('fails without either', async () => {
    pages.clear();
    pages.set('/', '<html></html>');
    expect((await verifyFile('example.com', TOKEN, get, base)).ok).toBe(false);
  });

  it('a meta tag in the body doesn’t count (a visitor could have posted it)', async () => {
    pages.clear();
    pages.set(
      '/',
      `<html><head></head><body><p>Comment: <meta name="fitts-verify" content="AB12CD34EF"></p></body></html>`,
    );
    expect((await verifyFile('example.com', TOKEN, get, base)).ok).toBe(false);
  });

  it('a check redirected to another site doesn’t count; www. is the same site', async () => {
    const redirected = (to: string) => () =>
      Promise.resolve({ status: 200, text: `${TOKEN}\n`, url: to });
    const elsewhere = redirected('https://attacker.example/.well-known/fitts-verify.txt');
    expect((await verifyFile('example.com', TOKEN, elsewhere)).ok).toBe(false);
    const www = redirected('https://www.example.com/.well-known/fitts-verify.txt');
    expect((await verifyFile('example.com', TOKEN, www)).ok).toBe(true);
  });
});
