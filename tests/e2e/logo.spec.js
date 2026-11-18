import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The draggable Vin's Atelier logo in the side panel's sign-off morphs between three forms (short </>, middle </in>,
// long </Atelier>), driven by one CSS variable, --logo-x. Locators are scoped to the sign-off. No real network: vwesley.dev is stubbed.
const dist = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), 'dist');
const X = { short: 540, middle: 734, long: 1491.4 };
const SIGN = '.studio-signoff';
// Slow (software-rendered) machines need room for the --logo-x morph to finish.
const POLL = { timeout: 15_000 };

let ctx;
let dir;
let extId;
test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tldr-logo-'));
  ctx = await chromium.launchPersistentContext(dir, {
    channel: 'chromium', // new headless mode, required for extensions
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  extId = new URL(sw.url()).host;
  await ctx.route('https://vwesley.dev/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
});
test.afterAll(async () => {
  await ctx?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const html = (page) => page.locator('html');
const link = (page) => page.locator(`${SIGN} .brand`);
const logo = (page) => page.locator(`${SIGN} svg.brand-logo`);
const radio = (page, form) => page.locator(`#more input[name="logo-form"][value="${form}"]`);
/** The right chevron's start in viewBox units, measured from the rendered geometry (minus the hover/first-visit hint tug). */
const chevronX = (page) =>
  page.evaluate(() => {
    const s = document.querySelector('.studio-signoff .brand-logo').getBoundingClientRect();
    const el = document.querySelector('.studio-signoff .bl-right');
    const r = el.getBoundingClientRect();
    const tug = parseFloat(getComputedStyle(el).translate) || 0;
    return (r.left - s.left) / (s.height / 432) - tug;
  });
const width = async (page) => (await logo(page).boundingBox()).width;
/** Fresh panel page on a clean storage state (the persistent context shares localStorage), settings open, scrolled to the sign-off. */
async function open(w = 420, motion = 'no-preference') {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: w, height: 800 });
  await page.emulateMedia({ reducedMotion: motion });
  const url = `chrome-extension://${extId}/sidepanel.html`;
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await page.locator('#more > summary').click(); // the Logo radios live in the settings (closed by default)
  await link(page).scrollIntoViewIfNeeded();
  return page;
}
async function pick(page, form) {
  await radio(page, form).check({ force: true });
  // Target = the --logo-x the page resolved for this form and viewport (html does not transition), after the morph has settled.
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished.catch(() => 0))));
  const shown = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--logo-x')));
  await expect.poll(() => chevronX(page), POLL).toBeCloseTo(shown, 0);
}
async function drag(page, dx, from = 10) {
  const b = await link(page).boundingBox();
  const y = b.y + b.height / 2;
  const x = b.x + from;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 6 });
  await page.mouse.move(x + dx, y, { steps: 6 });
  await page.mouse.up();
}

test('default form is middle; the radios sit in the settings, the sign-off at the bottom', async () => {
  const page = await open();
  const attr = await html(page).getAttribute('data-logo');
  expect(attr === null || attr === 'middle').toBe(true);
  expect(await chevronX(page)).toBeCloseTo(X.middle, 0);
  await expect(radio(page, 'middle')).toBeChecked();
  await expect(page.locator(`${SIGN} input`)).toHaveCount(0);
  // after #footnote, and a logo radio never counts as a summary option (no re-run, no saved pref)
  expect(await page.evaluate(() => document.querySelector('#footnote').nextElementSibling.className)).toBe('studio-signoff');
  await radio(page, 'long').check({ force: true });
  await expect(html(page)).toHaveAttribute('data-logo', 'long');
  expect(Object.keys(await ctx.serviceWorkers()[0].evaluate(() => chrome.storage.local.get(null)))).not.toContain('logo-form');
});

test('radios switch the form and it persists across a reload', async () => {
  const page = await open(1000);
  const widths = { short: 0, middle: 0, long: 0 };
  for (const f of ['short', 'long', 'middle']) {
    await pick(page, f);
    await expect(html(page)).toHaveAttribute('data-logo', f);
    widths[f] = await width(page);
  }
  expect(widths.short).toBeLessThan(widths.middle);
  expect(widths.middle).toBeLessThan(widths.long);
  await pick(page, 'long');
  await page.reload();
  await expect(html(page)).toHaveAttribute('data-logo', 'long');
  expect(await chevronX(page)).toBeCloseTo(X.long, 0);
  await expect(radio(page, 'long')).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('logo-form'))).toBe('long');
});

test('the radios work with arrow keys', async () => {
  const page = await open(1000);
  await radio(page, 'middle').focus();
  await page.keyboard.press('ArrowRight');
  await expect(radio(page, 'long')).toBeChecked();
  await expect(html(page)).toHaveAttribute('data-logo', 'long');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(radio(page, 'short')).toBeChecked();
  await expect(html(page)).toHaveAttribute('data-logo', 'short');
});

test('dragging the logo right snaps to long, left to short, and never navigates', async () => {
  const page = await open(1000);
  const url = page.url();
  const pages = ctx.pages().length;
  await drag(page, 120);
  await expect(html(page)).toHaveAttribute('data-logo', 'long');
  await expect.poll(() => chevronX(page), POLL).toBeCloseTo(X.long, 0);
  expect(page.url()).toBe(url);
  await page.waitForTimeout(200);
  await drag(page, -100, 120);
  await expect(html(page)).toHaveAttribute('data-logo', 'short');
  await expect.poll(() => chevronX(page), POLL).toBeCloseTo(X.short, 0);
  expect(page.url()).toBe(url);
  expect(ctx.pages().length).toBe(pages); // no new tab opened
  expect(await page.evaluate(() => localStorage.getItem('logo-form'))).toBe('short');
});

test('while dragging the logo holds each form for a stretch (a notch), then follows the pointer, with no transition', async () => {
  const page = await open(1000);
  const b = await link(page).boundingBox();
  const y = b.y + b.height / 2;
  await page.mouse.move(b.x + 10, y);
  await page.mouse.down();
  // 18px right of the start: still inside the middle form's notch, </in> fully shown.
  await page.mouse.move(b.x + 28, y, { steps: 4 });
  expect(await chevronX(page)).toBeCloseTo(X.middle, 0);
  expect(await page.locator(`${SIGN} .bl-in`).evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  // 40px: past the notch, on the way to the long form.
  await page.mouse.move(b.x + 50, y, { steps: 4 });
  const mid = await chevronX(page);
  expect(mid).toBeGreaterThan(X.middle + 100);
  expect(mid).toBeLessThan(X.long);
  expect(await logo(page).evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
  await page.mouse.up();
});

test('a short drag either way lets go on the middle form', async () => {
  const page = await open(1000);
  await drag(page, 25);
  await expect(html(page)).toHaveAttribute('data-logo', 'middle');
  await page.waitForTimeout(200);
  await drag(page, -18, 40);
  await expect(html(page)).toHaveAttribute('data-logo', 'middle');
});

test('a plain click on the logo opens vwesley.dev in a new tab', async () => {
  const page = await open();
  await expect(link(page)).toHaveAttribute('href', 'https://vwesley.dev');
  await expect(link(page)).toHaveAttribute('target', '_blank');
  await expect(link(page)).toHaveAttribute('rel', 'noopener');
  const popup = ctx.waitForEvent('page');
  await link(page).click({ position: { x: 10, y: 10 } });
  expect((await popup).url()).toContain('vwesley.dev');
});

test('sign-off text and both Logo by links are visible, and the header is unchanged', async () => {
  const page = await open();
  await expect(page.locator(SIGN)).toContainText("Copyright 2026 Vin's Atelier.");
  await expect(page.locator(SIGN)).toContainText('Designed and built by Vin.');
  await expect(page.locator(SIGN).getByRole('link', { name: '@portus_workstation' })).toBeVisible();
  await expect(page.locator(SIGN).getByRole('link', { name: '@wason25_pz' })).toBeVisible();
  await expect(page.locator('.topbar h1')).toHaveText('TL;DR Panel');
  await expect(page.locator('.topbar svg.logo')).toHaveCount(1); // the panel's own mark stays
  await expect(page.locator('.topbar .brand-logo')).toHaveCount(0);
  await expect(page.locator('.topbar [data-logo-link]')).toHaveCount(0);
});

test('the Long option shows the middle form below 30rem, and dragging right stops there', async () => {
  const page = await open(375);
  const middle = await width(page);
  await radio(page, 'long').check({ force: true });
  await expect(html(page)).toHaveAttribute('data-logo', 'long');
  await expect.poll(() => chevronX(page), POLL).toBeCloseTo(X.middle, 0);
  expect(await width(page)).toBeCloseTo(middle, 0);
  await expect(radio(page, 'long')).toBeChecked();
  await pick(page, 'short');
  await drag(page, 120);
  await expect.poll(() => chevronX(page), POLL).toBeCloseTo(X.middle, 0);
});

test('tooltip, resize cursor, and a tug on the first three visits only', async () => {
  const page = await open(1000);
  await expect(link(page)).toHaveAttribute('title', 'Drag sideways to resize');
  expect(await link(page).evaluate((el) => getComputedStyle(el).cursor)).toBe('ew-resize');
  await expect(logo(page)).toHaveAttribute('data-hint', '');
  expect(await page.locator(`${SIGN} .bl-right`).evaluate((el) => getComputedStyle(el).animationName)).toBe('logo-hint');
  await page.reload();
  await page.reload();
  await expect(logo(page)).toHaveAttribute('data-hint', '');
  await page.reload();
  await expect(logo(page)).not.toHaveAttribute('data-hint');
});

test('no tug once a form is picked, and the hover tug points the way the logo can still grow', async () => {
  const page = await open(1000);
  await pick(page, 'long');
  await page.reload();
  await link(page).scrollIntoViewIfNeeded();
  await expect(logo(page)).not.toHaveAttribute('data-hint');
  await link(page).hover();
  await expect.poll(() => page.locator(`${SIGN} .bl-right`).evaluate((el) => parseFloat(getComputedStyle(el).translate))).toBeLessThan(0);
});

test('reduced motion: no tug at all, the tooltip stays', async () => {
  const page = await open(1000, 'reduce');
  await link(page).hover();
  const right = page.locator(`${SIGN} .bl-right`);
  expect(await right.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  expect(await right.evaluate((el) => getComputedStyle(el).translate)).toBe('none');
  await expect(link(page)).toHaveAttribute('title', 'Drag sideways to resize');
});

test('logo fill follows the theme toggle: #333 on light, white on dark', async () => {
  const page = await open();
  const fill = () => page.locator(`${SIGN} .bl-atelier`).evaluate((el) => getComputedStyle(el).fill);
  expect(await fill()).toBe('rgb(255, 255, 255)');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  expect(await fill()).toBe('rgb(51, 51, 51)');
});
