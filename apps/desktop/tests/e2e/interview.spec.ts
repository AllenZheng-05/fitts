import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yViolations } from './helpers/axe';
import { completeSetup } from './helpers/flows';
import { launchApp, type LaunchedApp } from './helpers/launch';
import { expectNoWindowScrollAt } from './helpers/layout';

let launched: LaunchedApp;

const chat = (page: Page) => page.getByRole('log', { name: 'Conversation with Fitts' });
const messageBox = (page: Page) => page.getByLabel('Message Fitts');
const site = (page: Page) => page.getByRole('region', { name: 'Your site' });

async function say(page: Page, text: string) {
  await messageBox(page).fill(text);
  await messageBox(page).press('Enter');
}

test.beforeEach(async () => {
  launched = await launchApp();
  await launched.page.setViewportSize({ width: 1440, height: 900 });
  await completeSetup(launched.page);
});

test.afterEach(async () => {
  await launched.close();
});

test('the interview fills the brief and starts the audit', async () => {
  const { page } = launched;
  await expect(chat(page)).toContainText(
    "Hi Allen! Before I touch anything, I'd love to hear about this site. What's it for?",
  );
  await expect(page.getByText('Want to skip the interview?')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'What I know so far' })).toContainText(
    'Waiting on you',
  );
  await expectNoSeriousA11yViolations(page);

  await say(page, 'A messaging app so my grandparents can text the family.');
  await expect(chat(page)).toContainText(
    'Got it. I can see the compose screen right now. Where do they get stuck?',
  );
  await expect(chat(page)).toContainText('Family messaging');
  await expect(page.getByText('I know enough to start')).toBeVisible();

  await say(page, 'They never know if a message sent.');
  await expect(chat(page)).toContainText('How should the app feel when they open it?');
  const replies = page.getByRole('group', { name: 'Suggested replies' });
  await replies.getByRole('button', { name: 'Calm and simple' }).click();
  await expect(replies).toBeHidden();
  await expect(chat(page)).toContainText("Thanks, that's what I needed.");

  await page.getByRole('button', { name: 'Start the audit' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Audit & fix' })).toHaveAttribute(
    'aria-current',
    'step',
  );
});

test('"Skip, just look around" starts the audit before the brief is ready', async () => {
  const { page } = launched;
  await page.getByRole('button', { name: 'Skip, just look around' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Audit & fix' })).toHaveAttribute(
    'aria-current',
    'step',
  );
});

test('the mic button: tap to listen, tap again to send', async () => {
  const { page } = launched;
  const mic = page.getByRole('button', { name: 'Talk to Fitts' });
  await mic.click();
  await expect(mic).toHaveAttribute('aria-pressed', 'true');
  await expect(messageBox(page)).toHaveValue('Listening…');
  await expect(page.getByRole('status').filter({ hasText: 'Mic on' })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(messageBox(page)).toHaveValue('Listening…');
  await mic.click();
  await expect(mic).toHaveAttribute('aria-pressed', 'false');
  const bubble = chat(page).getByRole('listitem').filter({ hasText: 'SPOKEN' });
  await expect(bubble).toContainText('A messaging app so my grandparents can text the family.');
});

test('the Brief popover saves and Fitts acknowledges it', async () => {
  const { page } = launched;
  await page.getByRole('button', { name: 'Brief', exact: true }).click();
  const popover = page.getByRole('dialog', { name: 'Brief' });
  await expect(popover).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  // One box, in the owner's words.
  const box = popover.getByLabel('About your site');
  await box.fill(`${await box.inputValue()} It should feel calm and readable.`);
  await popover.getByRole('button', { name: 'Save' }).click();
  await expect(popover).toBeHidden();
  await expect(chat(page)).toContainText("Got it, I'll keep that in mind from here.");
  await expect(chat(page)).toContainText('It should feel calm and readable.');
});

test('Point at something attaches the element to the message', async () => {
  const { page } = launched;
  await page.getByRole('button', { name: 'Point at something' }).click();
  await expect(page.getByText('Pointing: click an element')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Pointing: click an element')).toBeHidden();

  await page.getByRole('button', { name: 'Point at something' }).click();
  await site(page).getByRole('button', { name: 'NEXT' }).click({ force: true });
  await expect(page.getByText('pointing at #compose-next-1')).toBeVisible();
  await expect(messageBox(page)).toBeFocused();
  await messageBox(page).fill('This button is too vague.');
  await messageBox(page).press('Enter');
  const bubble = chat(page).getByRole('listitem').filter({ hasText: 'This button is too vague.' });
  await expect(bubble).toContainText('pointing at #compose-next-1');
});

test('the site is clickable and the toolbar navigates', async () => {
  const { page } = launched;
  const address = page.getByLabel('Address');
  await expect(address).toHaveValue('localhost:5173/compose');
  await site(page).getByRole('button', { name: 'Grandma' }).click();
  await site(page).getByRole('button', { name: 'NEXT' }).click();
  await expect(address).toHaveValue('localhost:5173/compose/recipient');
  await expect(site(page).getByText('To: (null)')).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(address).toHaveValue('localhost:5173/compose');
  await page.getByRole('button', { name: 'Forward' }).click();
  await expect(address).toHaveValue('localhost:5173/compose/recipient');
});

test('⌘L focuses the message box, and the layout never scrolls', async () => {
  const { page } = launched;
  await page.getByRole('button', { name: 'Brief', exact: true }).focus();
  await page.keyboard.press('ControlOrMeta+L');
  await expect(messageBox(page)).toBeFocused();
  await expectNoWindowScrollAt(page, { width: 1440, height: 900 });
  await expectNoWindowScrollAt(page, { width: 1200, height: 720 });
});
