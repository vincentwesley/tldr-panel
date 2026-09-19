import * as adapter from './lib/summarizer.js';
import { summarizeLong } from './lib/pipeline.js';
import { consumeStream } from './lib/stream.js';
import { renderMarkdown, toPlainText } from './lib/markdown.js';
import { getTargetTab, chooseTab, extractFromTab, PageError, MSG } from './lib/page.js';
import { createActivationListener } from './lib/activation.js';

const $ = (id) => document.getElementById(id);
const STATES = ['loading', 'download', 'unavailable', 'notice', 'error', 'result'];
const TYPES = ['tldr', 'key-points', 'headline'];
const LENGTHS = ['short', 'medium', 'long'];
const NEUTRAL_CODES = new Set(['internal', 'pdf', 'empty', 'file', 'no-grant']);
const prefs = { type: 'tldr', length: 'medium' };
const DEBOUNCE_MS = 400;
const NOTE_STOPPED = 'Stopped early. This summary is incomplete.';
const NOTE_TRUNCATED = 'This page is very long; only the first part was summarized.';

let page = null; // last successful extraction (null after a failed re-extraction)
let currentTabId = null; // tab the panel is summarizing
let ownTabId = null; // set only when the panel is open as a normal tab (tests)
let panelWindowId = null;
let stale = false; // user switched tabs / the tab navigated since the last extraction
let navigated = false;
let lastText = '';
let controller = null;
let runId = 0;
let running = false;
let announced = 0;
let debounceTimer = null;
let statusTimer = null;

// ---------- small UI helpers ----------
function show(...names) {
  for (const s of STATES) $(`state-${s}`).hidden = !names.includes(s);
  const loading = names.includes('loading');
  $('again-btn').hidden = loading || !names.some((n) => ['result', 'error', 'notice'].includes(n));
  $('copy-btn').hidden = loading || !names.includes('result') || !lastText;
  $('actions').hidden = $('copy-btn').hidden;
  $('skeleton').hidden = names.includes('result'); // streaming text replaces the placeholder lines
}

function setStatus(text) {
  const el = $('status');
  clearTimeout(statusTimer);
  el.textContent = '';
  if (text) statusTimer = setTimeout(() => (el.textContent = text), 50);
}

function setBusy(busy) {
  $('result').setAttribute('aria-busy', String(busy));
  $('again-btn').setAttribute('aria-disabled', String(busy));
}

const setLoading = (text) => ($('loading-text').textContent = text);

function setTitle(text) {
  const el = $('page-title');
  el.textContent = text || '';
  el.title = text || '';
  el.hidden = !text || stale;
}

function setNote(...notes) {
  const el = $('result-note');
  el.textContent = notes.filter(Boolean).join(' ');
  el.hidden = !el.textContent;
}

function renderResult(text) {
  lastText = text;
  $('result').replaceChildren(renderMarkdown(text, document));
}

function focusIfLost(el) {
  const a = document.activeElement;
  if (!a || a === document.body || a.id === 'cancel-btn' || a.id === 'again-btn' || a.closest?.('[hidden]')) {
    el.focus({ preventScroll: true });
  }
}

function setStale(on) {
  stale = on;
  $('stale-banner').hidden = !on;
  setTitle(on ? '' : page?.title || page?.url || '');
}

// ---------- preferences ----------
async function loadPrefs() {
  try {
    const stored = await chrome.storage.local.get(['type', 'length']);
    const type = stored?.type === 'teaser' ? 'tldr' : stored?.type; // migrate the removed Teaser style
    if (TYPES.includes(type)) prefs.type = type;
    if (LENGTHS.includes(stored?.length)) prefs.length = stored.length;
  } catch {
    /* storage unavailable or malformed: keep defaults */
  }
  try {
    for (const name of ['type', 'length']) {
      const input = [...document.querySelectorAll(`input[name="${name}"]`)].find((i) => i.value === prefs[name]);
      if (input) input.checked = true;
    }
  } catch {
    /* ignore */
  }
  syncOptions();
}

async function savePref(key, value) {
  prefs[key] = value;
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch {
    /* ignore: the choice still applies for this session */
  }
}

function syncOptions() {
  $('more').hidden = prefs.type === 'headline'; // Detail does not apply to headlines
  const chosen = document.querySelector('input[name="length"]:checked + span');
  $('more-summary').textContent = `Detail: ${chosen?.textContent || 'Standard'}`;
}

function options(withContext = true) {
  return adapter.buildOptions({
    type: prefs.type,
    length: prefs.length,
    sharedContext: withContext && page?.title ? `Web page titled: ${page.title}` : undefined,
  });
}

// ---------- states ----------
function showUnavailable(kind) {
  const missing = kind === 'missing';
  $('unavailable-title').textContent = missing ? 'Your version of Chrome is too old' : "Can't summarize on this device";
  $('unavailable-text').textContent = missing
    ? 'Update Chrome (menu > Help > About Google Chrome) to version 138 or newer on a desktop computer.'
    : "Chrome's built-in AI isn't available here. This usually means the computer or Chrome setup doesn't meet its requirements (below), or the page isn't in English.";
  $('unavailable-extra').hidden = missing;
  show('unavailable');
  $('unavailable-title').focus();
}

function showNotice(title, message) {
  $('notice-title').textContent = title;
  $('notice-text').textContent = message;
  show('notice');
  $('notice-title').focus();
}

function showError(title, message) {
  $('error-title').textContent = title;
  $('error-text').textContent = message;
  show('error'); // unhide first, then move focus
  $('error-title').focus();
}

function showDownload(availability) {
  const btn = $('download-btn');
  btn.textContent = availability === 'downloading' ? 'Resume download' : 'Download and summarize';
  btn.setAttribute('aria-disabled', 'false');
  $('download-progress-wrap').hidden = true;
  $('download-cancel-btn').hidden = true;
  show('download');
}

function describeError(e) {
  if (e instanceof PageError) {
    return NEUTRAL_CODES.has(e.code)
      ? { kind: 'notice', title: "Can't read this page", message: e.message }
      : { kind: 'error', title: 'Something went wrong', message: e.message };
  }
  switch (e?.name) {
    case 'AbortError':
      return { kind: 'abort' };
    case 'NotSupportedError':
      return { kind: 'error', title: 'Language not supported', message: "Chrome's on-device summarizer doesn't support this page's language or these options yet." };
    case 'NetworkError':
      return { kind: 'error', title: 'Download failed', message: 'The model download failed. Check your connection and try again.' };
    case 'QuotaExceededError':
    case 'TooLongError':
      return { kind: 'error', title: 'Page too long', message: 'This page is too long to summarize on-device.' };
    case 'EmptyOutputError':
      return { kind: 'error', title: 'No summary produced', message: "The model didn't return a summary for this page. Try again, or try a different style." };
    default:
      console.error('TL;DR Panel:', e);
      return { kind: 'error', title: 'Something went wrong', message: MSG.generic };
  }
}

function handleError(e, id, { fromDownload = false, availability } = {}) {
  if (id !== runId) return;
  const d = describeError(e);
  if (d.kind === 'abort') {
    if (fromDownload) {
      showDownload(availability || 'downloadable'); // neutral: back to the download card, not an error
    } else if (lastText) {
      setNote(page?.truncated && NOTE_TRUNCATED, NOTE_STOPPED);
      show('result');
      setStatus('Stopped');
    } else {
      showNotice('Cancelled', 'Press "Summarize again" to retry.');
      setStatus('Stopped');
    }
    return;
  }
  if (d.kind === 'notice') showNotice(d.title, d.message);
  else showError(d.title, d.message);
}

function newController() {
  controller?.abort();
  controller = new AbortController();
  return controller.signal;
}

const resolveTab = (tabId, wasStale) =>
  chooseTab({ tabId, stale: wasStale, currentTabId }, { getTab: (id) => chrome.tabs.get(id), getActive: getTargetTab });

// ---------- main flow ----------
async function run({ tabId = null, reextract = true } = {}) {
  clearTimeout(debounceTimer);
  const id = ++runId;
  const signal = newController();
  running = true;
  lastText = '';
  $('result').replaceChildren();
  setNote();
  setStatus('');
  const wasStale = stale; // the banner stays up until a fresh page was actually read
  setTitle('');
  setBusy(true);
  show('loading');
  setLoading('Reading page...');
  let availability;
  try {
    availability = await adapter.availability(options(false));
    if (id !== runId) return;
    if (availability === 'missing' || availability === 'unavailable') {
      showUnavailable(availability);
      return;
    }
    if (reextract || !page) {
      const tab = await resolveTab(tabId, wasStale);
      if (id !== runId) return;
      currentTabId = tab?.id ?? null;
      let fresh;
      try {
        fresh = await extractFromTab(tab);
      } catch (e) {
        if (id === runId) page = null; // never summarize a stale page after a failed re-extraction
        throw e;
      }
      if (id !== runId) return; // a newer run owns `page`
      page = fresh;
    }
    navigated = false;
    setStale(false);
    setTitle(page.title || page.url || '');
    if (availability === 'downloadable' || availability === 'downloading') {
      showDownload(availability);
      return;
    }
    await summarizePage(signal, id, null);
  } catch (e) {
    handleError(e, id);
  } finally {
    if (id === runId) {
      running = false;
      setBusy(false);
    }
  }
}

async function onDownloadClick() {
  if ($('download-btn').getAttribute('aria-disabled') === 'true') return;
  // create() must be called synchronously from this click handler (transient user activation).
  const id = ++runId;
  const signal = newController();
  running = true;
  announced = 0;
  const availability = $('download-btn').textContent.startsWith('Resume') ? 'downloading' : 'downloadable';
  const createPromise = adapter.create(options(), {
    signal,
    onProgress: (f) => {
      if (id !== runId) return;
      const pct = Math.round(f * 100);
      $('download-progress').value = pct;
      $('download-progress-text').textContent = pct >= 100 ? 'Download complete. Setting up...' : `${pct}%`;
      for (const t of [25, 50, 75, 100]) {
        if (pct >= t && announced < t) {
          announced = t;
          setStatus(t === 100 ? 'Download complete' : `Downloaded ${t}%`);
        }
      }
    },
  });
  $('download-btn').setAttribute('aria-disabled', 'true');
  $('download-progress-wrap').hidden = false;
  $('download-cancel-btn').hidden = false;
  setBusy(true);
  try {
    const created = await createPromise;
    if (id !== runId) {
      adapter.destroy(created);
      return;
    }
    await summarizePage(signal, id, created);
  } catch (e) {
    handleError(e, id, { fromDownload: !$('state-download').hidden, availability });
  } finally {
    if (id === runId) {
      running = false;
      setBusy(false);
    }
  }
}

async function summarizePage(signal, id, preCreated) {
  let s = preCreated;
  if (!s) {
    setLoading('Preparing the on-device model...');
    show('loading');
    const prepTimer = setTimeout(() => setLoading('Preparing the on-device model (first time can take up to a minute)...'), 2500);
    try {
      s = await adapter.create(options(), { signal });
    } finally {
      clearTimeout(prepTimer);
    }
    if (id !== runId) {
      adapter.destroy(s);
      return;
    }
  }
  setLoading('Reading the page...');
  show('loading');
  let chunkSummarizer = null;
  const context = page.title ? `Page title: ${page.title}` : undefined;
  const truncatedNote = page.truncated ? NOTE_TRUNCATED : '';
  try {
    const out = await summarizeLong(page.text, {
      quota: adapter.inputQuota(s),
      signal,
      measure: (t) => adapter.measureInputUsage(s, t),
      summarizeChunk: async (t) => {
        chunkSummarizer ??= await adapter.create(adapter.buildOptions({ type: 'key-points', length: 'medium' }), { signal });
        return adapter.summarize(chunkSummarizer, t, { context, signal });
      },
      summarizeFinal: (t) =>
        consumeStream(
          adapter.stream(s, t, { context, signal }),
          (text) => {
            if (id !== runId) return;
            renderResult(text);
          },
          signal,
        ),
      onProgress: (p) => {
        if (id !== runId) return;
        if (p.final) {
          setLoading('Writing summary...');
          setNote(truncatedNote);
          show('loading', 'result');
        } else {
          setLoading(`Part ${p.index} of ${p.total} - long pages can take a few minutes`);
          show('loading');
        }
      },
    });
    if (id !== runId) return;
    if (!out || !out.trim()) {
      const e = new Error('empty output');
      e.name = 'EmptyOutputError';
      throw e;
    }
    renderResult(out);
    setNote(truncatedNote);
    show('result');
    setStatus('Summary ready');
    focusIfLost($('result'));
  } finally {
    adapter.destroy(s);
    adapter.destroy(chunkSummarizer);
  }
}

async function copy() {
  if (!lastText) return;
  const head = page?.url ? `${page.title || page.url}\n${page.url}\n\n` : '';
  const btn = $('copy-btn');
  const label = $('copy-label');
  try {
    await navigator.clipboard.writeText(head + toPlainText(lastText));
    label.textContent = 'Copied';
    btn.dataset.state = 'done';
    setStatus('Copied to clipboard');
  } catch {
    label.textContent = 'Copy failed';
    btn.dataset.state = 'fail';
    setStatus('Copy failed');
  }
  setTimeout(() => {
    label.textContent = 'Copy';
    delete btn.dataset.state;
  }, 1500);
}

// ---------- tab tracking and activation ----------
async function initTabTracking() {
  try {
    ownTabId = (await chrome.tabs.getCurrent())?.id ?? null; // undefined inside a real side panel
    panelWindowId = (await chrome.windows.getCurrent())?.id ?? null;
  } catch {
    /* not fatal */
  }
  chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
    if (tabId === ownTabId || currentTabId == null) return;
    if (panelWindowId != null && windowId !== panelWindowId) return;
    if (tabId !== currentTabId) setStale(true);
    else if (!navigated) setStale(false);
  });
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (tabId === currentTabId && info.status === 'loading') {
      navigated = true;
      setStale(true);
    }
  });
  chrome.runtime.onMessage.addListener(
    createActivationListener({
      runtimeId: chrome.runtime.id,
      onActivated: (tabId) => {
        if (running && tabId === currentTabId) return; // the initial run for this very click is already in flight
        run({ tabId });
      },
    }),
  );
}

function scheduleRerun() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => run({ reextract: stale || !page }), DEBOUNCE_MS);
}

async function init() {
  $('controls').addEventListener('submit', (e) => e.preventDefault());
  await loadPrefs();
  for (const input of document.querySelectorAll('#controls input')) {
    input.addEventListener('change', async () => {
      await savePref(input.name, input.value);
      syncOptions();
      scheduleRerun();
    });
  }
  $('again-btn').addEventListener('click', () => {
    if ($('again-btn').getAttribute('aria-disabled') === 'true') return;
    run();
  });
  $('copy-btn').addEventListener('click', copy);
  const cancel = () => controller?.abort();
  $('cancel-btn').addEventListener('click', cancel);
  $('download-cancel-btn').addEventListener('click', cancel);
  $('download-btn').addEventListener('click', onDownloadClick);
  await initTabTracking();
  run();
}

init();
