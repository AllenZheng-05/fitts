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

const chat = (page: Page) => page.getByRole('log', { name: 'Conversation with Fitts' });

test.beforeEach(async () => {
  heard.handshake = null;
  heard.audioBytes = 0;
  heard.ended = false;
  server = new WebSocketServer({ port: 0 });
  await new Promise<void>((r) => server.once('listening', () => r()));
  server.on('connection', (ws) => {
    let open = false;
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        heard.audioBytes += (data as Buffer).length;
        ws.send(JSON.stringify({ type: 'transcript', transcript: 'It helps grandparents' }));
        return;
      }
      const msg = JSON.parse((data as Buffer).toString('utf8')) as Record<string, unknown>;
      if (!open) {
        open = true;
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

test('tap to talk: the mic streams to Transcribe, partials show, and the final text is sent spoken', async () => {
  const { page } = launched;
  const mic = page.getByRole('button', { name: 'Talk to Fitts' });
  await mic.click();
  await expect(page.getByRole('status').filter({ hasText: 'Mic on' })).toBeVisible();
  // The worklet's 100ms frames reach the server, and its partial shows in the message box.
  await expect.poll(() => heard.audioBytes, { timeout: 10_000 }).toBeGreaterThan(4800);
  await expect(page.getByLabel('Message Fitts')).toHaveValue('It helps grandparents');
  await mic.click();
  await expect.poll(() => heard.ended).toBe(true);
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
