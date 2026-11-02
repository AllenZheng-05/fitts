// Reproduces each of demo/chat's 33 planted issues (demo/chat/PLANTED.md) in an offscreen
// Electron window, the way Fitts's CDP driver will see the app. Usage:
//   pnpm --filter demo-chat dev        (in another terminal)
//   electron scripts/check-demo-chat.cjs [port]
const { app, BrowserWindow } = require('electron');

const port = process.argv.find((a) => /^\d{4,5}$/.test(a)) ?? '5173';
const BASE = `http://localhost:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    show: false,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true },
  });
  const wc = win.webContents;
  console.error('ready');
  await wc.loadURL('about:blank');
  const dbg = wc.debugger;
  dbg.attach('1.3');
  await dbg.sendCommand('Network.enable');
  const requests = [];
  dbg.on('message', (_e, method, params) => {
    if (method === 'Network.requestWillBeSent') requests.push(params.request);
  });
  const withTimeout = (p, ms, what) =>
    Promise.race([
      p,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: ' + what)), ms)),
    ]);
  const js = (code) => withTimeout(wc.executeJavaScript(code, true), 5000, code.slice(0, 60));
  const go = async (path) => {
    console.error('go', path);
    await withTimeout(wc.loadURL(BASE + path), 10000, 'load ' + path);
    await sleep(500);
  };
  const click = async (ref) => {
    await js(`document.querySelector('[data-ref="${ref}"]').click()`);
    await sleep(300);
  };
  console.error('reset');
  await withTimeout(fetch(BASE + '/api/__reset', { method: 'POST' }), 5000, 'reset');

  const results = [];
  const check = async (n, name, fn) => {
    console.error('check', n);
    try {
      const detail = await withTimeout(fn(), 10000, 'check ' + n);
      results.push({
        n,
        name,
        ok: Boolean(detail),
        detail: typeof detail === 'string' ? detail : '',
      });
    } catch (e) {
      results.push({ n, name, ok: false, detail: e.message });
    }
  };

  // Compose flow.
  await go('/compose');
  await click('compose-contact-grandma');
  await click('compose-next-1');
  await check(1, 'Recipient shows "(null)" on step 2', async () =>
    (await js(`document.querySelector('[data-ref="compose-to"]').textContent`)).includes('(null)'),
  );
  await check(
    6,
    'Recipient from step 1 not shown on step 2',
    async () =>
      !(await js(`document.querySelector('[data-ref="compose-to"]').textContent`)).includes(
        'Grandma',
      ),
  );
  await check(2, 'One action labeled NEXT / Send Text / Create Message', async () => {
    const step2 = await js(
      `[...document.querySelectorAll('button')].map(b => b.textContent.trim())`,
    );
    return (
      step2.includes('NEXT') &&
      step2.includes('Create Message') &&
      'NEXT + Create Message on step 2'
    );
  });
  await check(5, 'No back or cancel control in compose', async () => {
    const labels = await js(
      `[...document.querySelectorAll('button, a')].map(b => b.textContent.trim().toLowerCase())`,
    );
    return !labels.some((l) => /back|cancel/.test(l));
  });
  await check(8, 'Placeholder contrast about 2.6:1', async () => {
    const color = await js(
      `getComputedStyle(document.querySelector('[data-ref="compose-body"]'), '::placeholder').color`,
    );
    return color.includes('161') && color;
  });
  await js(`(() => { const t = document.querySelector('[data-ref="compose-body"]');
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    set.call(t, 'Hi Grandma'); t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(200);
  await check(4, 'Browser back on step 2 loses the draft', async () => {
    await js('history.back()');
    await sleep(300);
    await js('history.forward()');
    await sleep(300);
    return (await js(`document.querySelector('[data-ref="compose-body"]').value`)) === '';
  });
  await click('compose-next');
  await check(7, 'Send target is 28x20 px', async () => {
    const r = await js(
      `(() => { const b = document.querySelector('[data-ref="compose-send"]').getBoundingClientRect(); return [b.width, b.height]; })()`,
    );
    return r[0] === 28 && r[1] === 20 && `${r[0]}x${r[1]}`;
  });
  await check(14, 'Empty send shows "Error 0x3F"', async () => {
    await click('compose-send');
    await sleep(300);
    return (await js(`document.body.textContent`)).includes('Error 0x3F');
  });
  await go('/compose');
  await click('compose-next-1');
  await js(`(() => { const t = document.querySelector('[data-ref="compose-body"]');
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    set.call(t, 'See you Sunday'); t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(100);
  await click('compose-next');
  await check(3, 'No confirmation after sending', async () => {
    await click('compose-send');
    await sleep(500);
    const path = await js('location.pathname');
    const text = await js('document.body.textContent');
    return path === '/' && !/sent/i.test(text) && 'back to inbox, no message';
  });

  // Inbox.
  await go('/');
  await check(
    9,
    'Timestamp text #BBB on white',
    async () =>
      (await js(`getComputedStyle(document.querySelector('.stamp')).color`)) ===
      'rgb(187, 187, 187)',
  );
  await check(24, 'Help link returns 404', async () => {
    const href = await js(`document.querySelector('[data-ref="inbox-help"]').getAttribute('href')`);
    const res = await fetch(BASE + href, { method: 'HEAD' });
    return res.status === 404 && `HEAD ${href} → 404`;
  });
  await check(19, 'Three font families', async () => {
    const fams = await js(
      `[...new Set([...document.querySelectorAll('h1, button, span')].map(e => getComputedStyle(e).fontFamily.split(',')[0]))]`,
    );
    return fams.length >= 3 && fams.join(' | ');
  });
  await check(20, 'Off-grid, inconsistent padding', async () => {
    const pads = await js(
      `[...new Set([...document.querySelectorAll('*')].flatMap(e => { const s = getComputedStyle(e); return [s.paddingTop, s.paddingLeft]; }).filter(p => p !== '0px'))]`,
    );
    const off = pads.filter((p) => parseFloat(p) % 4 !== 0);
    return off.length > 0 && `off-grid: ${off.join(', ')}`;
  });
  await check(23, 'Focus outline removed globally', async () => {
    await js(`document.querySelector('[data-ref="inbox-compose"]').focus()`);
    const s = await js(
      `(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle + ' ' + s.outlineWidth; })()`,
    );
    return /none|0px/.test(s) && s;
  });

  // Search.
  await go('/search');
  requests.length = 0;
  await js(`document.querySelector('[data-ref="search-input"]').focus()`);
  for (const ch of 'gran') wc.sendInputEvent({ type: 'char', keyCode: ch });
  await sleep(300);
  await check(10, 'Search sends a request on every keystroke', async () => {
    const n = requests.filter((r) => r.url.includes('/api/search')).length;
    return n >= 4 && `${n} requests for 4 keystrokes`;
  });
  await check(
    13,
    'No loading indicator during the 1.5s search',
    async () =>
      (await js(
        `document.querySelectorAll('[role=status], [aria-busy=true], .spinner').length`,
      )) === 0,
  );
  await check(11, 'Repeat search re-fetches, no cache headers', async () => {
    const res = await fetch(BASE + '/api/search?q=gran');
    return (
      !res.headers.get('cache-control') && !res.headers.get('etag') && 'no Cache-Control or ETag'
    );
  });
  await check(12, 'Search returns 20,000 items, no pagination', async () => {
    const res = await fetch(BASE + '/api/search?q=gran');
    const body = await res.json();
    return body.items.length === 20000 && `${body.items.length} items`;
  });
  await sleep(1600);
  const searchDate = await js(`document.querySelector('.result .small')?.textContent ?? ''`);

  // Thread.
  await go('/contacts/grandma');
  const threadDate = await js(`document.querySelector('.stamp-long')?.textContent ?? ''`);
  await check(17, 'Icon-only buttons with no accessible name', async () => {
    const unnamed = await js(
      `[...document.querySelectorAll('button')].filter(b => !b.textContent.trim() && !b.getAttribute('aria-label')).length`,
    );
    return unnamed >= 2 && `${unnamed} unnamed`;
  });
  await check(22, 'Jargon "Initialize thread"', async () =>
    (await js('document.body.textContent')).includes('Initialize thread'),
  );
  await go('/');
  const inboxDate = await js(`document.querySelector('.stamp')?.textContent ?? ''`);
  await check(18, 'Three date formats across screens', async () => {
    const ok =
      /^\d+\/\d+\/\d+$/.test(inboxDate) &&
      /^\d{4}-\d\d-\d\d$/.test(searchDate) &&
      /[A-Z][a-z]{2} \d+, /.test(threadDate);
    return ok && `${inboxDate} | ${threadDate} | ${searchDate}`;
  });
  await go('/contacts/grandma');
  requests.length = 0;
  await check(16, '"Delete conversation" deletes instantly', async () => {
    await click('thread-delete');
    await sleep(400);
    const del = requests.find((r) => r.method === 'DELETE');
    const res = await fetch(BASE + '/api/conversations/12');
    return del && res.status === 404 && `${del.method} ${new URL(del.url).pathname}`;
  });

  // Settings and contacts.
  await go('/settings');
  await check(21, 'Settings has 14 ungrouped toggles', async () => {
    const n = await js(`document.querySelectorAll('[role=switch]').length`);
    const groups = await js(`document.querySelectorAll('fieldset, h2, h3').length`);
    return n === 14 && groups === 0 && `${n} toggles, no groups`;
  });
  await check(26, 'Settings scrolls sideways at 320px', async () => {
    win.setContentSize(320, 640);
    await sleep(300);
    const at320 = await js('document.documentElement.scrollWidth - window.innerWidth');
    win.setContentSize(360, 640);
    await sleep(300);
    const at360 = await js('document.documentElement.scrollWidth - window.innerWidth');
    win.setContentSize(1000, 800);
    await sleep(200);
    return at320 > 1 && at360 <= 1 && `${at320}px over at 320, fits at 360`;
  });
  await go('/contacts');
  await check(25, 'Contacts page has no empty state', async () => {
    await js(`(() => { const i = document.querySelector('[data-ref="contacts-filter"]');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(i, 'zzz'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(200);
    const items = await js(`document.querySelectorAll('[data-ref="contacts-list"] li').length`);
    const text = await js(
      `document.querySelector('[data-ref="contacts-list"]').textContent.trim()`,
    );
    return items === 0 && text === '';
  });
  await go('/contacts');
  await check(15, 'Validation error clears the whole form', async () => {
    await js(`(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      for (const [label, v] of [['Name', 'Ana'], ['Phone', 'abc']]) { const i = document.querySelector('[aria-label="' + label + '"]');
        set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
    await sleep(100);
    await click('contacts-add-submit');
    await sleep(400);
    const vals = await js(
      `[document.querySelector('[aria-label="Name"]').value, document.querySelector('[aria-label="Phone"]').value]`,
    );
    const err = (await js('document.body.textContent')).includes('Invalid input');
    return err && vals[0] === '' && vals[1] === '';
  });

  // Detect more (#27–#33).
  await go('/');
  await check(27, 'Avatar images with no alt text', async () =>
    js(
      `[...document.querySelectorAll('img.avatar')].filter((i) => !i.hasAttribute('alt')).length`,
    ).then((n) => n > 0 && `${n} images`),
  );
  await check(29, '"Rate us" pops up 1.5 s in; the keyboard can’t close it', async () => {
    await js("sessionStorage.removeItem('rated')");
    await go('/');
    await sleep(1800);
    const open = await js('!!document.querySelector(\'[role=dialog][aria-label="Rate us"]\')');
    const focusIn = await js(
      "document.querySelector('[role=dialog]')?.contains(document.activeElement) ?? false",
    );
    const closeIsButton = await js("document.querySelector('.rate-close')?.tagName === 'BUTTON'");
    return open && !focusIn && !closeIsButton && 'open, focus outside, close not a button';
  });
  await go('/contacts');
  await check(28, 'Contacts search field with no label', async () =>
    js(
      `(() => { const i = document.querySelector('[data-ref="contacts-filter"]'); return !i.getAttribute('aria-label') && !i.getAttribute('placeholder') && !i.labels.length; })()`,
    ),
  );
  await go('/settings');
  await check(31, 'Settings’ "Contacts" link goes to /settings/privacy', async () => {
    const href = await js(
      `document.querySelector('[data-ref="settings-contacts"]').getAttribute('href')`,
    );
    await click('settings-contacts');
    const path = await js('location.pathname');
    return href === '/contacts' && path === '/settings/privacy' && `href ${href}, went to ${path}`;
  });
  await go('/compose/confirm');
  await withTimeout(
    new Promise((r) => {
      wc.once('did-finish-load', r);
      wc.reload();
    }),
    10000,
    'reload',
  );
  await sleep(500);
  await check(32, 'Refreshing /compose/confirm shows a blank page', async () =>
    js("document.querySelector('main').textContent.trim() === ''"),
  );
  await go('/compose');
  await click('compose-next-1');
  await click('compose-next');
  await check(30, 'A tip pushes Send down as you reach for it', async () => {
    const before = await js(
      `document.querySelector('[data-ref="compose-send"]').getBoundingClientRect().top`,
    );
    await js(
      `document.querySelector('[data-ref="compose-send"]').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))`,
    );
    await sleep(200);
    const after = await js(
      `document.querySelector('[data-ref="compose-send"]').getBoundingClientRect().top`,
    );
    return after - before > 20 && `moved ${Math.round(after - before)} px`;
  });
  await check(33, 'Contacts goes blank when its request fails', async () => {
    await dbg.sendCommand('Fetch.enable', { patterns: [{ urlPattern: '*/api/contacts' }] });
    const onPause = (_e, method, params) => {
      if (method === 'Fetch.requestPaused')
        void dbg.sendCommand('Fetch.fulfillRequest', {
          requestId: params.requestId,
          responseCode: 500,
          body: Buffer.from('{}').toString('base64'),
        });
    };
    dbg.on('message', onPause);
    await go('/contacts');
    await sleep(500);
    dbg.removeListener('message', onPause);
    await dbg.sendCommand('Fetch.disable');
    return js("document.querySelector('main').textContent.trim() === ''");
  });

  await fetch(BASE + '/api/__reset', { method: 'POST' });
  results.sort((a, b) => a.n - b.n);
  for (const r of results)
    console.log(`${r.ok ? 'PASS' : 'FAIL'} #${r.n} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`${passed}/${results.length} planted issues reproduced`);
  app.exit(passed === 33 && results.length === 33 ? 0 : 1);
});
