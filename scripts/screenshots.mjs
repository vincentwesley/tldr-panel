// Regenerates docs/screenshots/*.png (1280x800 store size: fixture article + side panel at 420px).
// Requires `npm run build -- --e2e` first (uses dist-e2e and the fake Summarizer from the e2e suite).
// The result screenshots use REAL on-device model output when docs/screenshots/raw/real-result-{light,dark}.png
// exist (captured manually with Puppeteer against real Chrome; see DECISIONS.md), otherwise the e2e fake's text.
// Only the fixture page and the panel are captured, never browser chrome or other tabs.
import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFake } from '../tests/e2e/fake-summarizer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-e2e');
const shots = path.join(root, 'docs', 'screenshots');
const raw = path.join(shots, 'raw');
fs.mkdirSync(raw, { recursive: true });

const article = fs.readFileSync(path.join(root, 'tests/e2e/fixtures/screenshot-article.html'));
const server = http.createServer((_q, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(article);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'tldr-shots-')), {
  channel: 'chromium',
  headless: true,
  viewport: { width: 860, height: 800 },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;

const target = await ctx.newPage();
await target.goto(origin + '/');
await target.bringToFront();
await target.screenshot({ path: path.join(raw, 'page.png') });
const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);

async function panelShot(name, scenario, scheme, ready) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 420, height: 800 });
  await p.emulateMedia({ colorScheme: scheme });
  await p.addInitScript(installFake, scenario);
  await p.goto(`chrome-extension://${extId}/sidepanel.html?tabId=${tabId}`);
  await p.locator(ready).waitFor({ timeout: 20000 });
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(raw, `${name}.png`) });
  await p.close();
}
await panelShot('fake-result-light', 'success', 'light', '#state-result #result li:nth-child(3)');
await panelShot('fake-result-dark', 'success', 'dark', '#state-result #result li:nth-child(3)');
await panelShot('download', 'download', 'light', '#download-btn');
await panelShot('unavailable', 'unavailable', 'light', '#unavailable-title');

const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const pick = (real, fake) => (fs.existsSync(path.join(raw, real)) ? real : fake);
const compose = async (out, panelFile) => {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(`<body style="margin:0;background:#dfe3e8;display:flex;width:1280px;height:800px">
    <img src="${b64(path.join(raw, 'page.png'))}" style="width:860px;height:800px;display:block">
    <img src="${b64(path.join(raw, panelFile))}" style="width:420px;height:800px;display:block"></body>`);
  await page.screenshot({ path: path.join(shots, out) });
  await page.close();
};
await compose('result-light.png', pick('real-result-light.png', 'fake-result-light.png'));
await compose('result-dark.png', pick('real-result-dark.png', 'fake-result-dark.png'));
await compose('download.png', 'download.png');
await compose('unavailable.png', 'unavailable.png');

await ctx.close();
server.close();
console.log('screenshots written to docs/screenshots');
