// Dev tool: screenshots every panel state at 320/420/600 px in light and dark (optionally RTL / forced colours).
// Usage: node scripts/build.mjs && node scripts/build.mjs --e2e && node scripts/ui-states.mjs <outDir> [--rtl] [--forced]
// Uses the e2e build (dist-e2e), the shipped build (dist, for the no-grant notice) and the e2e fake Summarizer. Not shipped.
import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFake } from '../tests/e2e/fake-summarizer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || 'ui-states');
const rtl = process.argv.includes('--rtl');
const forced = process.argv.includes('--forced');
fs.mkdirSync(out, { recursive: true });

const article = fs.readFileSync(path.join(root, 'tests/e2e/fixtures/article.html'));
const para = (t, n) => `<p>${t}</p>`.repeat(n);
const longTitle =
  '<!doctype html><title>An exceptionally long article headline that keeps going well past the width of a narrow side panel to test truncation</title><body><article><h1>Long</h1>' +
  para('The council discussed the agenda item in considerable detail today and agreed to continue.', 12) +
  '</article></body>';
const bigPage =
  '<!doctype html><title>Very long page</title><body><article><h1>Very long page</h1>' +
  para('The council discussed the long agenda item in considerable detail today. '.repeat(20), 500) +
  '</article></body>';
const article2 =
  '<!doctype html><title>Harbour reopens</title><body><article><h1>Harbour reopens</h1>' +
  para('The harbour authority confirmed that deep-water berths reopen on Monday after eight months.', 6) +
  '</article></body>';
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  if (req.url === '/empty') return res.end('<title>Empty</title><body></body>');
  if (req.url === '/long') return res.end(bigPage);
  if (req.url === '/longtitle') return res.end(longTitle);
  if (req.url === '/article2') return res.end(article2);
  res.end(article);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const launch = (ext) =>
  chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'tldr-ui-')), {
    channel: 'chromium',
    headless: true,
    viewport: { width: 420, height: 800 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
const hangAvailability = () => {
  const t = setInterval(() => {
    if (globalThis.Summarizer) {
      globalThis.Summarizer.availability = () => new Promise(() => {});
      clearInterval(t);
    }
  }, 0);
};
const styleClick = (v) => async (p) => {
  await p.check(`input[name=type][value=${v}]`, { force: true });
  await p.waitForFunction(() => document.querySelectorAll('#result li').length >= 3 || document.querySelector('#result p'), null, { timeout: 10000 });
  await p.waitForTimeout(1200);
};

// [name, scenario, fixture, ready selector, act(page, ctx), init, build]
const STATES = [
  ['loading', 'success', '/article', '#state-loading:not([hidden])', null, hangAvailability],
  ['download', 'download', '/article', '#download-btn'],
  ['downloading', 'download', '/article', '#download-btn', async (p) => { await p.click('#download-btn'); await p.waitForTimeout(700); }],
  ['streaming', 'slow', '/article', '#result p'],
  ['result-summary', 'success', '/article', '#result li:nth-child(3)'],
  ['result-keypoints', 'success', '/article', '#result li:nth-child(3)', styleClick('key-points')],
  ['result-headline', 'success', '/article', '#result li:nth-child(3)', styleClick('headline')],
  ['result-longtitle', 'success', '/longtitle', '#result li:nth-child(3)'],
  ['truncated', 'bigquota', '/long', '#result-note:not([hidden])'],
  ['stopped-early', 'slow', '/article', '#result p', async (p) => { await p.click('#cancel-btn'); await p.waitForTimeout(500); }],
  ['stale', 'success', '/article', '#result li:nth-child(3)', async (p, ctx) => { const s = await ctx.newPage(); await s.goto(origin + '/article2'); await s.bringToFront(); await p.waitForTimeout(600); }],
  ['unavailable', 'unavailable', '/article', '#unavailable-title'],
  ['missing-api', 'missing', '/article', '#unavailable-title'],
  ['error', 'error', '/article', '#state-error:not([hidden])'],
  ['empty-model', 'empty', '/article', '#state-error:not([hidden])'],
  ['notice-empty-page', 'success', '/empty', '#state-notice:not([hidden])'],
  ['notice-no-grant', 'success', '/article', '#state-notice:not([hidden])', null, null, 'shipped'],
];

for (const [name, scenario, fixture, ready, act, init, build = 'e2e'] of STATES) {
  const ctx = await launch(path.join(root, build === 'e2e' ? 'dist-e2e' : 'dist')); // fresh browser per state: stable
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  const keeper = await ctx.newPage();
  for (const scheme of ['light', 'dark']) {
    for (const w of [320, 420, 600]) {
      const target = await ctx.newPage();
      await target.goto(origin + fixture);
      await target.bringToFront();
      const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
      const p = await ctx.newPage();
      await p.setViewportSize({ width: w, height: 640 });
      await p.emulateMedia({ colorScheme: scheme, ...(forced ? { forcedColors: 'active' } : {}) });
      await p.addInitScript(installFake, scenario);
      if (init) await p.addInitScript(init);
      if (rtl) await p.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { document.documentElement.dir = 'rtl'; }));
      await p.goto(`chrome-extension://${extId}/sidepanel.html?tabId=${tabId}`);
      try {
        await p.waitForSelector(ready, { timeout: 20000 });
        await p.waitForTimeout(350);
        if (act) await act(p, ctx);
        await p.waitForTimeout(250);
      } catch (e) {
        console.error('state', name, w, scheme, e.message.slice(0, 80));
      }
      try {
        await p.screenshot({ path: path.join(out, `${name}_${scheme}_${w}.png`), fullPage: true });
      } catch (e) {
        console.error('shot failed', name, w, scheme, e.message.slice(0, 80));
      }
      for (const pg of ctx.pages()) if (pg !== keeper) await pg.close().catch(() => {});
    }
  }
  await ctx.close();
}
server.close();
console.log('done', out);
