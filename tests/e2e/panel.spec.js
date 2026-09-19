import { test, expect, chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFake } from './fake-summarizer.js';

// What is and is NOT covered here (see DECISIONS.md "Verification"):
//  - Playwright cannot click the real toolbar icon, so it cannot obtain a real activeTab grant.
//    The e2e build (dist-e2e) adds host_permissions for 127.0.0.1 to run the real extraction path, and the
//    panel accepts ?tabId= (compiled out of dist/). The real click -> grant -> summarize path was verified
//    manually in Chrome 153 with Puppeteer + an OS-level click (see DECISIONS.md), not in this suite.
//  - The service worker -> panel "tldr:activated" message IS exercised for real (sw.evaluate sends it).

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(root, 'dist');
const DIST_E2E = path.join(root, 'dist-e2e');

let server;
let origin;

const article2 = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Harbour reopens after dredging</title></head><body>
<nav>NAV2-NOISE</nav><article><h1>Harbour reopens after dredging</h1>
${Array.from({ length: 5 }, (_, i) => `<p>Paragraph ${i}: the harbour authority confirmed that deep-water berths reopen on Monday after eight months of dredging, with ferries and freight vessels returning in phases across the coming fortnight.</p>`).join('\n')}
</article><footer>FOOTER2-NOISE</footer></body></html>`;

test.beforeAll(async () => {
  const articleHtml = fs.readFileSync(path.join(root, 'tests/e2e/fixtures/article.html'));
  server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    if (req.url === '/empty') return res.end('<title>Empty</title><body></body>');
    if (req.url === '/article2') return res.end(article2);
    if (req.url === '/long') {
      const p = '<p>' + 'The council discussed the long agenda item in considerable detail today. '.repeat(20) + '</p>';
      return res.end(`<!doctype html><title>Very long page</title><body><article><h1>Very long page</h1>${p.repeat(500)}</article></body>`);
    }
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

const activeTabId = (sw) =>
  sw.evaluate(async () => {
    const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return t.id;
  });

/** Opens a fixture page (active tab), then the panel page pointed at it via ?tabId= (e2e build only). */
async function openPanel({ ctx, sw, extId }, { scenario, scheme = 'light', fixture = '/article', init } = {}) {
  const target = await ctx.newPage();
  await target.goto(origin + fixture);
  await target.bringToFront();
  const tabId = await activeTabId(sw);
  const panel = await ctx.newPage();
  await panel.emulateMedia({ colorScheme: scheme });
  if (scenario) await panel.addInitScript(installFake, scenario);
  if (init) await panel.addInitScript(init);
  await panel.goto(`chrome-extension://${extId}/sidepanel.html?tabId=${tabId}`);
  return { panel, target, tabId };
}

const fakeCalls = (panel) => panel.evaluate(() => window.__fakeCalls);
const resultLis = (panel) => panel.locator('#result li');

test.describe('with fake Summarizer (e2e build)', () => {
  let h;
  test.beforeEach(async () => {
    h = await launch(DIST_E2E);
  });
  test.afterEach(async () => {
    await h.ctx.close();
  });

  test('streams a summary of the fixture article (real extraction, delta stream)', async () => {
    const { panel } = await openPanel(h, { scenario: 'success' });
    await expect(panel.locator('#page-title')).toHaveText('City approves new bike-lane network');
    await expect(resultLis(panel)).toHaveCount(3, { timeout: 15000 });
    await expect(panel.locator('#result strong')).toHaveText('Main idea:');
    await expect(panel.locator('#copy-btn')).toBeVisible();
    await expect(panel.locator('#cancel-btn')).toBeHidden();
    await expect(panel.locator('#status')).toHaveText('Summary ready');
    // aria-live moved off the streaming region: only the single status line announces
    expect(await panel.locator('#result').getAttribute('aria-live')).toBeNull();
    await expect(panel.locator('#result')).toHaveAttribute('aria-busy', 'false');
    await expect(panel.locator('#result')).toBeFocused(); // focus lands on the result on completion
    const calls = await fakeCalls(panel);
    expect(calls.stream).toHaveLength(1);
    // Extraction stripped nav/footer noise: the model only received the article text.
    expect(calls.stream[0].text).toContain('forty kilometres of protected bike lanes');
    expect(calls.stream[0].text).not.toContain('NAVIGATION-NOISE');
    expect(calls.stream[0].text).not.toContain('FOOTER-NOISE');
    expect(calls.stream[0].text).toMatch(/\n\n/); // paragraph breaks survive extraction
    expect(calls.create[0]).toMatchObject({ type: 'tldr', length: 'medium', outputLanguage: 'en' });
    await expect.poll(async () => (await fakeCalls(panel)).destroyed).toBe(calls.create.length);
  });

  test('persists style/detail, debounces re-runs, and re-summarizes on change', async () => {
    const { panel } = await openPanel(h, { scenario: 'success' });
    await expect(resultLis(panel)).toHaveCount(3, { timeout: 15000 });
    await expect(panel.locator('#more')).toBeVisible();
    // rapid changes produce a single re-run (400ms debounce)
    await panel.locator('#more summary').click(); // Detail lives inside "More options"
    await panel.getByLabel('Detailed').check({ force: true });
    await panel.getByRole('radio', { name: 'Key points' }).check({ force: true });
    await expect.poll(async () => (await fakeCalls(panel)).create.length).toBe(2);
    await panel.waitForTimeout(800);
    expect((await fakeCalls(panel)).create).toHaveLength(2);
    expect((await fakeCalls(panel)).create.at(-1)).toMatchObject({ type: 'key-points', length: 'long' });
    const stored = await panel.evaluate(() => chrome.storage.local.get(['type', 'length']));
    expect(stored).toEqual({ type: 'key-points', length: 'long' });
    await panel.reload();
    await expect(panel.getByRole('radio', { name: 'Key points' })).toBeChecked();
    await expect(panel.locator('input[name=length][value=long]')).toBeChecked();
  });

  test('Headline hides the Detail option', async () => {
    const { panel } = await openPanel(h, { scenario: 'success' });
    await expect(resultLis(panel)).toHaveCount(3, { timeout: 15000 });
    await panel.getByRole('radio', { name: 'Headline' }).check({ force: true });
    await expect(panel.locator('#more')).toBeHidden();
    await expect(panel.getByRole('group', { name: 'Style' })).toBeVisible();
  });

  test('migrates the removed Teaser style and ignores junk stored values', async () => {
    await h.sw.evaluate(() => chrome.storage.local.set({ type: 'teaser', length: '"]),x' }));
    const { panel } = await openPanel(h, { scenario: 'success' });
    await expect(panel.getByRole('radio', { name: 'Summary' })).toBeChecked();
    await expect(panel.locator('input[name=length][value=medium]')).toBeChecked();
    await expect(resultLis(panel)).toHaveCount(3, { timeout: 15000 });
    expect((await fakeCalls(panel)).create[0]).toMatchObject({ type: 'tldr', length: 'medium' });
  });

  test('a failing chrome.storage still lets the panel work with defaults', async () => {
    const { panel } = await openPanel(h, {
      scenario: 'success',
      init: () => {
        chrome.storage.local.get = () => Promise.reject(new Error('storage down'));
        chrome.storage.local.set = () => Promise.reject(new Error('storage down'));
      },
    });
    await expect(resultLis(panel)).toHaveCount(3, { timeout: 15000 });
    await panel.getByRole('radio', { name: 'Key points' }).check({ force: true }); // savePref must not throw
    await expect.poll(async () => (await fakeCalls(panel)).create.at(-1).type).toBe('key-points');
  });

  test('download flow: card copy, button, user activation, throttled progress, then summary', async () => {
    const { panel } = await openPanel(h, { scenario: 'download' });
    const btn = panel.getByRole('button', { name: 'Download and summarize' });
    await expect(btn).toBeVisible();
    await expect(panel.locator('#state-download h2')).toHaveText("One-time setup: download Chrome's on-device AI");
    await expect(panel.locator('#state-download')).toContainText('22 GB');
    await expect(panel.locator('#state-download')).not.toContainText(/\d\s?(MB|GB)\b.*model/i);
    expect((await fakeCalls(panel)).create).toHaveLength(0); // nothing created without a click
    await btn.click();
    await expect(panel.locator('#download-progress-wrap')).toBeVisible();
    await expect(panel.locator('#download-progress-text')).toHaveText(/50%|75%|Download complete/, { timeout: 5000 });
    await expect(resultLis(panel)).toHaveCount(3, { timeout: 15000 });
    expect((await fakeCalls(panel)).create[0].activation).toBe(true);
  });

  test('cancelling the download returns to the neutral download card (no error)', async () => {
    const { panel } = await openPanel(h, { scenario: 'download' });
    await panel.getByRole('button', { name: 'Download and summarize' }).click();
    await expect(panel.locator('#download-cancel-btn')).toBeVisible();
    await panel.locator('#download-cancel-btn').click();
    await expect(panel.locator('#state-download')).toBeVisible();
    await expect(panel.locator('#state-error')).toBeHidden();
    await expect(panel.getByRole('button', { name: 'Download and summarize' })).toHaveAttribute('aria-disabled', 'false');
    await expect(panel.locator('#download-progress-wrap')).toBeHidden();
  });

  test('unavailable device shows the new copy and requirements', async () => {
    const { panel } = await openPanel(h, { scenario: 'unavailable' });
    await expect(panel.locator('#unavailable-title')).toHaveText("Can't summarize on this device");
    await expect(panel.locator('#state-unavailable')).toContainText('chrome://on-device-internals');
    await expect(panel.locator('.requirements li')).toHaveCount(4);
    await expect(panel.locator('.requirements')).toContainText('22 GB');
    await expect(panel.locator('#unavailable-title')).toBeFocused();
  });

  test('missing Summarizer API shows the update message without the requirements list', async () => {
    const { panel } = await openPanel(h, { scenario: 'missing' });
    await expect(panel.locator('#unavailable-title')).toHaveText('Your version of Chrome is too old');
    await expect(panel.locator('#state-unavailable')).toContainText('version 138 or newer on a desktop computer');
    await expect(panel.locator('.requirements')).toBeHidden();
  });

  test('long page goes through chunking with part progress', async () => {
    const { panel } = await openPanel(h, { scenario: 'quota' });
    await expect(resultLis(panel)).toHaveCount(3, { timeout: 20000 });
    const calls = await fakeCalls(panel);
    expect(calls.summarize.length).toBeGreaterThan(3); // key-points chunk pass ran
    expect(calls.summarize.every((c) => c.type === 'key-points')).toBe(true);
    expect(calls.stream[0].type).toBe('tldr'); // final pass uses the chosen type
    expect(calls.stream[0].len).toBeLessThan(60 * 4 + 1);
  });

  test('a very long page shows the truncation note', async () => {
    const { panel } = await openPanel(h, { scenario: 'bigquota', fixture: '/long' });
    await expect(resultLis(panel)).toHaveCount(3, { timeout: 30000 });
    await expect(panel.locator('#result-note')).toHaveText('This page is very long; only the first part was summarized.');
    expect((await fakeCalls(panel)).stream[0].len).toBeLessThanOrEqual(120000);
  });

  test('model error shows a friendly red error, never the raw message', async () => {
    const { panel } = await openPanel(h, { scenario: 'error' });
    await expect(panel.locator('#error-text')).toHaveText('Something unexpected happened. Try again, or reload the page.');
    await expect(panel.locator('#error-text')).not.toContainText('crashed');
    await expect(panel.locator('#error-title')).toBeFocused();
    await expect(panel.locator('#again-btn')).toHaveAttribute('aria-disabled', 'false');
  });

  test('empty model output shows a friendly error', async () => {
    const { panel } = await openPanel(h, { scenario: 'empty' });
    await expect(panel.locator('#error-title')).toHaveText('No summary produced');
  });

  test('cancel mid-stream keeps the partial text with an "incomplete" note', async () => {
    const { panel } = await openPanel(h, { scenario: 'slow' });
    await expect(panel.locator('#result')).toContainText('Working');
    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect(panel.locator('#cancel-btn')).toBeHidden();
    await expect(panel.locator('#result')).toContainText('Working'); // partial text kept
    await expect(panel.locator('#result-note')).toHaveText('Stopped early. This summary is incomplete.');
    await expect(panel.locator('#status')).toHaveText('Stopped');
    await expect(panel.locator('#again-btn')).toHaveAttribute('aria-disabled', 'false');
  });

  test('changing style mid-stream: the stale run cannot overwrite the new one', async () => {
    const { panel } = await openPanel(h, { scenario: 'slowfirst' });
    await expect(panel.locator('#result')).toContainText('FIRST-RUN-STALE');
    await panel.getByRole('radio', { name: 'Key points' }).check({ force: true });
    await expect(resultLis(panel)).toHaveCount(3, { timeout: 15000 });
    await expect(panel.locator('#result')).not.toContainText('FIRST-RUN-STALE');
    await panel.waitForTimeout(500);
    await expect(panel.locator('#result')).not.toContainText('FIRST-RUN-STALE');
    await expect(panel.locator('#status')).toHaveText('Summary ready');
  });

  test('empty page is a neutral notice (not red) with the new copy', async () => {
    const { panel } = await openPanel(h, { scenario: 'success', fixture: '/empty' });
    await expect(panel.locator('#notice-title')).toHaveText("Can't read this page");
    await expect(panel.locator('#notice-text')).toHaveText("There isn't enough text on this page to summarize.");
    await expect(panel.locator('#state-error')).toBeHidden();
    await expect(panel.locator('#notice-title')).toBeFocused();
  });

  test('after a failed page read, changing style does not summarize the OLD page', async () => {
    const { panel, target } = await openPanel(h, { scenario: 'success' });
    await expect(resultLis(panel)).toHaveCount(3, { timeout: 15000 });
    await target.goto(origin + '/empty'); // same tab now has no text; panel re-extracts on "again"
    await panel.locator('#again-btn').click();
    await expect(panel.locator('#notice-title')).toBeVisible();
    const before = (await fakeCalls(panel)).stream.length;
    await panel.getByRole('radio', { name: 'Key points' }).check({ force: true });
    await expect(panel.locator('#notice-title')).toBeVisible(); // re-extraction failed again; no old summary
    await panel.waitForTimeout(900);
    expect((await fakeCalls(panel)).stream.length).toBe(before);
  });

  test('copy puts plain text on the clipboard (no ** markers) and announces via the status line', async () => {
    // Headless extension pages have no clipboard permission prompt; capture the write instead. The real
    // clipboard was exercised manually in Chrome 153 (DECISIONS.md).
    const { panel } = await openPanel(h, {
      scenario: 'success',
      init: () => {
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => (window.__clip = t) }, configurable: true });
      },
    });
    await expect(resultLis(panel)).toHaveCount(3, { timeout: 15000 });
    await panel.locator('#copy-btn').click();
    await expect(panel.locator('#status')).toHaveText('Copied to clipboard');
    const clip = await panel.evaluate(() => window.__clip);
    expect(clip).toContain('Main idea: The city council');
    expect(clip).toContain('• Construction starts');
    expect(clip).not.toContain('**');
    expect(clip.startsWith('City approves new bike-lane network\nhttp://127.0.0.1:')).toBe(true);
  });

  test('service worker "tldr:activated" message re-summarizes the given tab (second-tab flow)', async () => {
    const { panel, tabId } = await openPanel(h, { scenario: 'success' });
    await expect(resultLis(panel)).toHaveCount(3, { timeout: 15000 });
    const second = await h.ctx.newPage();
    await second.goto(origin + '/article2');
    await second.bringToFront();
    const tab2 = await activeTabId(h.sw);
    expect(tab2).not.toBe(tabId);
    // switching tabs makes the panel stale
    await expect(panel.locator('#stale-banner')).toBeVisible();
    await expect(panel.locator('#stale-banner')).toHaveText('You switched pages. Click the TL;DR Panel icon to summarize this one.');
    await expect(panel.locator('#page-title')).toBeHidden();
    await expect(panel.locator('#stale-banner button')).toHaveCount(0);
    // what background.js sends after a real icon click
    await h.sw.evaluate((id) => chrome.runtime.sendMessage({ type: 'tldr:activated', tabId: id }), tab2);
    await expect(panel.locator('#page-title')).toHaveText('Harbour reopens after dredging', { timeout: 15000 });
    await expect(panel.locator('#stale-banner')).toBeHidden();
    await expect(resultLis(panel)).toHaveCount(3, { timeout: 15000 });
    const calls = await fakeCalls(panel);
    expect(calls.stream.at(-1).text).toContain('deep-water berths reopen');
    expect(calls.stream.at(-1).text).not.toContain('NAV2-NOISE');
    expect(calls.stream).toHaveLength(2);
  });

  test('a message with the wrong shape is ignored', async () => {
    const { panel } = await openPanel(h, { scenario: 'success' });
    await expect(resultLis(panel)).toHaveCount(3, { timeout: 15000 });
    await h.sw.evaluate(() => chrome.runtime.sendMessage({ type: 'something-else', tabId: 1 }).catch(() => {}));
    await h.sw.evaluate(() => chrome.runtime.sendMessage({ type: 'tldr:activated', tabId: 'x' }).catch(() => {}));
    await panel.waitForTimeout(700);
    expect((await fakeCalls(panel)).stream).toHaveLength(1);
  });

  test('layout: no horizontal overflow at 320px and no forced-colors breakage', async () => {
    const { panel } = await openPanel(h, { scenario: 'success' });
    await expect(resultLis(panel)).toHaveCount(3, { timeout: 15000 });
    await panel.setViewportSize({ width: 320, height: 700 });
    expect(await panel.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await panel.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await expect(panel.locator('input[name=type]:checked + span')).toBeVisible();
  });

  test('page content cannot inject HTML into the panel', async () => {
    const { panel } = await openPanel(h, { scenario: 'success' });
    await expect(resultLis(panel)).toHaveCount(3, { timeout: 15000 });
    expect(await panel.locator('#result img, #result script').count()).toBe(0);
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

  test('manifest: no host permissions, explicit CSP, action shortcut, short description', async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.json'), 'utf8'));
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.permissions.sort()).toEqual(['activeTab', 'scripting', 'sidePanel', 'storage']);
    expect(manifest.commands._execute_action.suggested_key.default).toBe('Alt+Shift+S');
    expect(manifest.content_security_policy.extension_pages).toMatch(/script-src 'self'.*object-src 'self'.*base-uri 'none'.*form-action 'none'/);
    expect(manifest.description.length).toBeLessThanOrEqual(132);
    expect(fs.existsSync(path.join(DIST, 'LICENSE-readability.md'))).toBe(true);
    expect(fs.existsSync(path.join(DIST, '.e2e-build'))).toBe(false);
  });

  test('without an activeTab grant the panel shows the neutral "click the icon" notice', async () => {
    const { panel } = await openPanel(h, { scenario: 'success' });
    await expect(panel.locator('#notice-text')).toHaveText(
      "To read this tab, click the TL;DR Panel icon in Chrome's toolbar (look under the puzzle-piece menu if you don't see it).",
    );
    await expect(panel.locator('#state-error')).toBeHidden();
  });

  test('the ?tabId= test hook is not in the shipped build', async () => {
    const js = fs.readFileSync(path.join(DIST, 'sidepanel.js'), 'utf8');
    expect(js).not.toMatch(/get\(["']tabId["']\)/);
  });

  test('opened with no target tab (own extension page) it does not crash and asks for a click', async () => {
    const page = await h.ctx.newPage();
    await page.addInitScript(installFake, 'success');
    await page.goto(`chrome-extension://${h.extId}/sidepanel.html`);
    await expect(page.locator('#notice-text')).toContainText('toolbar');
  });

  test('the service worker no longer enables openPanelOnActionClick (it does not grant activeTab)', async () => {
    const behavior = await h.sw.evaluate(() => chrome.sidePanel.getPanelBehavior());
    expect(behavior.openPanelOnActionClick).toBe(false);
  });
});
