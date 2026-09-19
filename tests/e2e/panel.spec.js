import { test, expect, chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFake } from './fake-summarizer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(root, 'dist');
const DIST_E2E = path.join(root, 'dist-e2e'); // same code + host_permissions for 127.0.0.1 (see DECISIONS.md)
const SHOTS = path.join(root, 'docs', 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

let server;
let origin;

test.beforeAll(async () => {
  const articleHtml = fs.readFileSync(path.join(root, 'tests/e2e/fixtures/article.html'));
  server = http.createServer((req, res) => {
    if (req.url === '/pdf.pdf') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<title>x</title>');
    }
    if (req.url === '/empty') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<title>Empty</title><body></body>');
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(articleHtml);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(() => server.close());

async function launch(extPath) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tldr-e2e-'));
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium', // new headless mode, required for extensions
    headless: true,
    viewport: { width: 420, height: 760 },
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  return { ctx, sw, extId };
}

/** Opens a fixture page (active tab), then the panel page pointed at it via ?tabId=. */
async function openPanel({ ctx, sw, extId }, { scenario, scheme = 'light', fixture = '/article' } = {}) {
  const target = await ctx.newPage();
  await target.goto(origin + fixture);
  await target.bringToFront();
  const tabId = await sw.evaluate(async () => {
    const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return t.id;
  });
  const panel = await ctx.newPage();
  await panel.emulateMedia({ colorScheme: scheme });
  if (scenario) await panel.addInitScript(installFake, scenario);
  await panel.goto(`chrome-extension://${extId}/sidepanel.html?tabId=${tabId}`);
  return { panel, target, shot: async (name) => panel.screenshot({ path: path.join(SHOTS, `${name}-${scheme}.png`) }) };
}

const resultText = (panel) => panel.locator('#result').innerText();

test.describe('with fake Summarizer (e2e build)', () => {
  let h;
  test.beforeEach(async () => {
    h = await launch(DIST_E2E);
  });
  test.afterEach(async () => {
    await h.ctx.close();
  });

  test('streams a summary of the fixture article (real extraction, delta stream)', async () => {
    const { panel, shot } = await openPanel(h, { scenario: 'success' });
    await expect(panel.locator('#page-title')).toHaveText('City approves new bike-lane network');
    await expect(panel.locator('#result li')).toHaveCount(3, { timeout: 15000 });
    await expect(panel.locator('#result strong')).toHaveText('Main idea:');
    await expect(panel.locator('#copy-btn')).toBeVisible();
    await expect(panel.locator('#cancel-btn')).toBeHidden();
    await expect(panel.locator('#result')).toHaveAttribute('aria-live', 'polite');
    const calls = await panel.evaluate(() => window.__fakeCalls);
    // Extraction stripped nav/footer noise: the streamed input is the article only.
    expect(calls.stream).toHaveLength(1);
    expect(calls.create[0]).toMatchObject({ type: 'tldr', length: 'medium', outputLanguage: 'en' });
    expect(calls.destroyed).toBeGreaterThan(0);
    await shot('result');
    await panel.emulateMedia({ colorScheme: 'dark' });
    await panel.screenshot({ path: path.join(SHOTS, 'result-dark.png') });
  });

  test('persists style/length and re-summarizes on change', async () => {
    const { panel } = await openPanel(h, { scenario: 'success' });
    await expect(panel.locator('#result li')).toHaveCount(3, { timeout: 15000 });
    await panel.getByLabel('Key points').check({ force: true });
    await panel.getByLabel('Long').check({ force: true });
    await expect.poll(async () => (await panel.evaluate(() => window.__fakeCalls.create)).length).toBeGreaterThan(1);
    const stored = await panel.evaluate(() => chrome.storage.local.get(['type', 'length']));
    expect(stored).toEqual({ type: 'key-points', length: 'long' });
    await expect.poll(async () => (await panel.evaluate(() => window.__fakeCalls.create)).at(-1).type).toBe('key-points');
    // Prefs survive a reload.
    await panel.reload();
    await expect(panel.getByLabel('Key points')).toBeChecked();
    await expect(panel.getByLabel('Long')).toBeChecked();
  });

  test('download flow: button, user activation, progress, then summary', async () => {
    const { panel, shot } = await openPanel(h, { scenario: 'download' });
    const btn = panel.getByRole('button', { name: 'Download on-device model' });
    await expect(btn).toBeVisible();
    expect(await panel.evaluate(() => window.__fakeCalls.create.length)).toBe(0); // nothing created without a click
    await shot('download');
    await panel.emulateMedia({ colorScheme: 'dark' });
    await panel.screenshot({ path: path.join(SHOTS, 'download-dark.png') });
    await btn.click();
    await expect(panel.locator('#download-progress-wrap')).toBeVisible();
    await expect(panel.locator('#download-progress-text')).toHaveText(/50%|75%/, { timeout: 5000 });
    await expect(panel.locator('#result li')).toHaveCount(3, { timeout: 15000 });
    const calls = await panel.evaluate(() => window.__fakeCalls);
    expect(calls.create[0].activation).toBe(true);
  });

  test('unavailable device shows requirements', async () => {
    const { panel, shot } = await openPanel(h, { scenario: 'unavailable' });
    await expect(panel.locator('#unavailable-title')).toHaveText('On-device summarizer unavailable');
    await expect(panel.locator('.requirements li')).toHaveCount(4);
    await expect(panel.locator('.requirements')).toContainText('22 GB');
    await shot('unavailable');
    await panel.emulateMedia({ colorScheme: 'dark' });
    await panel.screenshot({ path: path.join(SHOTS, 'unavailable-dark.png') });
  });

  test('missing Summarizer API shows update message', async () => {
    const { panel } = await openPanel(h, { scenario: 'missing' });
    await expect(panel.locator('#unavailable-title')).toContainText("doesn't have the Summarizer API");
    await expect(panel.locator('#state-unavailable')).toContainText('138');
  });

  test('long page goes through chunking with part progress', async () => {
    const { panel } = await openPanel(h, { scenario: 'quota' });
    await expect(panel.locator('#result li')).toHaveCount(3, { timeout: 20000 });
    const calls = await panel.evaluate(() => window.__fakeCalls);
    expect(calls.summarize.length).toBeGreaterThan(3); // key-points chunk pass ran
    expect(calls.summarize.every((c) => c.type === 'key-points')).toBe(true);
    expect(calls.stream[0].type).toBe('tldr'); // final pass uses the chosen type
    expect(calls.stream[0].len).toBeLessThan(60 * 4 + 1);
  });

  test('model error shows an error state', async () => {
    const { panel } = await openPanel(h, { scenario: 'error' });
    await expect(panel.locator('#error-text')).toHaveText('The model crashed unexpectedly');
    await expect(panel.locator('#again-btn')).toBeEnabled();
  });

  test('cancel aborts a running summary', async () => {
    const { panel } = await openPanel(h, { scenario: 'slow' });
    await expect(panel.locator('#result')).toContainText('Working');
    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect(panel.locator('#cancel-btn')).toBeHidden();
    await expect(panel.locator('#result')).toContainText('Working'); // partial text kept
    await expect(panel.locator('#again-btn')).toBeEnabled();
  });

  test('empty page shows a clear message', async () => {
    const { panel } = await openPanel(h, { scenario: 'success', fixture: '/empty' });
    await expect(panel.locator('#error-text')).toContainText('enough readable text');
  });

  test('page content cannot inject HTML into the panel', async () => {
    const { panel } = await openPanel(h, { scenario: 'success' });
    await expect(panel.locator('#result li')).toHaveCount(3, { timeout: 15000 });
    expect(await panel.locator('#result img, #result script').count()).toBe(0);
    expect(await resultText(panel)).toContain('Main idea:');
  });
});

test.describe('shipped build (no host permissions)', () => {
  let h;
  test.beforeEach(async () => {
    h = await launch(DIST);
  });
  test.afterEach(async () => {
    await h.ctx.close();
  });

  test('manifest requests no host permissions', async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.json'), 'utf8'));
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.permissions.sort()).toEqual(['activeTab', 'scripting', 'sidePanel', 'storage']);
    expect(manifest.commands._execute_action.suggested_key.default).toBe('Alt+Shift+S');
  });

  test('without an activeTab grant the panel asks for a toolbar click', async () => {
    const { panel } = await openPanel(h, { scenario: 'success' });
    await expect(panel.locator('#error-text')).toHaveText('Click the TL;DR Panel toolbar icon on this tab to summarize it.');
  });

  test('opened on an extension page it explains it cannot read it', async () => {
    const page = await h.ctx.newPage();
    await page.addInitScript(installFake, 'success');
    await page.goto(`chrome-extension://${h.extId}/sidepanel.html`);
    await expect(page.locator('#error-text')).toContainText("doesn't let extensions read");
  });

  test('service worker registers openPanelOnActionClick', async () => {
    const behavior = await h.sw.evaluate(() => chrome.sidePanel.getPanelBehavior());
    expect(behavior.openPanelOnActionClick).toBe(true);
  });
});
