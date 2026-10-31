// Voice (SPEC-phase2 §14) end to end, with no network and no real mic: Chromium's fake audio
// device feeds the real capture path (AudioWorklet → main → Transcribe WebSocket), and a local
// server speaks V5's protocol. The final text goes to the run as a spoken answer.
import { expect, test, type Page } from '@playwright/test';
import { WebSocketServer } from 'ws';
import { completeSetup } from './helpers/flows';
import { launchApp, type LaunchedApp } from './helpers/launch';

let launched: LaunchedApp;
let server: WebSocketServer;
const heard = { handshake: null as Record<string, unknown> | null, audioBytes: 0, ended: false };
/** Turns the endpointing server has sent ("Fitts, …"), one per always-listening session. */
const wakeTurns: string[] = [];

const chat = (page: Page) => page.getByRole('log', { name: 'Conversation with Fitts' });

test.beforeEach(async () => {
  heard.handshake = null;
  heard.audioBytes = 0;
  heard.ended = false;
  wakeTurns.length = 0;
  server = new WebSocketServer({ port: 0 });
  await new Promise<void>((r) => server.once('listening', () => r()));
  server.on('connection', (ws) => {
    let open = false;
    let mode = '';
    let bytes = 0;
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        heard.audioBytes += (data as Buffer).length;
        bytes += (data as Buffer).length;
        // Always listening: one "Fitts, …" turn per session, after half a second of audio.
        if (mode === 'ENDPOINTING') {
          if (bytes >= 24_000 && wakeTurns.length === 0) {
            const turn = 'Fitts, check the search page next.';
            wakeTurns.push(turn);
            ws.send(JSON.stringify({ type: 'speechStart' }));
            ws.send(JSON.stringify({ type: 'transcript', transcript: turn }));
            ws.send(JSON.stringify({ type: 'speechComplete', transcript: turn }));
          }
          return;
        }
        ws.send(JSON.stringify({ type: 'transcript', transcript: 'It helps grandparents' }));
        return;
      }
      const msg = JSON.parse((data as Buffer).toString('utf8')) as Record<string, unknown>;
      if (!open) {
        open = true;
        mode = String(msg['mode']);
        heard.handshake = msg;
        ws.send(JSON.stringify({ type: 'sessionStarted', sessionId: 'e2e' }));
      } else if (msg['type'] === 'endStream') {
        heard.ended = true;
        ws.send(
          JSON.stringify({
            type: 'speechComplete',
            transcript: 'It helps grandparents text the family.',
          }),
        );
        ws.close(1000, 'No more transcript segments');
      }
    });
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  launched = await launchApp({
    env: { FITTS_TRANSCRIBE_URL: `ws://127.0.0.1:${port}` },
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  await launched.page.setViewportSize({ width: 1440, height: 900 });
  await completeSetup(launched.page);
});

test.afterEach(async () => {
  await launched.close();
  server.close();
});

test('tap to talk: the mic streams to Transcribe, partials show, and the final text waits in the box to send', async () => {
  const { page } = launched;
  const mic = page.getByRole('button', { name: 'Talk to Fitts' });
  await mic.click();
  await expect(page.getByRole('status').filter({ hasText: 'Mic on' })).toBeVisible();
  // The worklet's 100ms frames reach the server, and its partial shows in the message box.
  await expect.poll(() => heard.audioBytes, { timeout: 10_000 }).toBeGreaterThan(4800);
  await expect(page.getByLabel('Message Fitts')).toHaveValue('It helps grandparents');
  await mic.click();
  await expect.poll(() => heard.ended).toBe(true);
  await expect(page.getByLabel('Message Fitts')).toHaveValue(
    'It helps grandparents text the family.',
  );
  await page.getByLabel('Message Fitts').press('Enter');
  const bubble = chat(page).getByRole('listitem').filter({ hasText: 'SPOKEN' });
  await expect(bubble).toContainText('It helps grandparents text the family.');
  expect(heard.handshake).toMatchObject({
    mode: 'PUSH_TO_TALK',
    audioEncoding: 'PCM_24KHZ',
    keywords: ['Fitts'],
    authorization: { accessToken: expect.any(String) },
  });
  await expect(page.getByRole('status').filter({ hasText: 'Mic on' })).toBeHidden();
});

test('always listening: “Fitts, …” is sent spoken, and the mic button still works alongside it', async () => {
  const { page } = launched;
  await page.keyboard.press('ControlOrMeta+,');
  await page.getByRole('button', { name: 'Voice & appearance' }).click();
  await page.getByLabel('How you talk to Fitts').selectOption('wake');
  await page.getByRole('button', { name: 'Back to workspace' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Listening for "Fitts"' })).toBeVisible({
    timeout: 10_000,
  });
  await expect.poll(() => wakeTurns.length, { timeout: 10_000 }).toBeGreaterThan(0);
  const bubble = chat(page).getByRole('listitem').filter({ hasText: 'SPOKEN' });
  await expect(bubble.filter({ hasText: 'Check the search page next.' })).toHaveCount(1);
  expect(heard.handshake).toMatchObject({ mode: 'ENDPOINTING' });

  // The mic button takes over from always listening, and always listening comes back after.
  const mic = page.getByRole('button', { name: 'Talk to Fitts' });
  await mic.click();
  await expect(page.getByLabel('Message Fitts')).toHaveValue('It helps grandparents');
  await mic.click();
  await expect(page.getByLabel('Message Fitts')).toHaveValue(
    'It helps grandparents text the family.',
  );
  await page.getByLabel('Message Fitts').press('Enter');
  await expect(bubble.filter({ hasText: 'It helps grandparents text the family.' })).toHaveCount(1);
  await expect(page.getByRole('status').filter({ hasText: 'Listening for "Fitts"' })).toBeVisible({
    timeout: 10_000,
  });
});
