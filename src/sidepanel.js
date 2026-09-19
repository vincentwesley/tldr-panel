import * as adapter from './lib/summarizer.js';
import { summarizeLong } from './lib/pipeline.js';
import { consumeStream } from './lib/stream.js';
import { renderMarkdown } from './lib/markdown.js';
import { getTargetTab, extractFromTab, PageError } from './lib/page.js';

const $ = (id) => document.getElementById(id);
const STATES = ['loading', 'download', 'unavailable', 'error', 'result'];
const prefs = { type: 'tldr', length: 'medium' };

let page = null; // last extraction
let lastText = '';
let controller = null;
let runId = 0;
let summarizer = null;

function show(...names) {
  for (const s of STATES) $(`state-${s}`).hidden = !names.includes(s);
}

function setBusy(busy) {
  $('cancel-btn').hidden = !busy;
  $('again-btn').disabled = busy;
  $('result').setAttribute('aria-busy', String(busy));
  $('copy-btn').hidden = busy || !lastText;
}

function setLoading(text) {
  $('loading-text').textContent = text;
}

function renderResult(text) {
  lastText = text;
  const el = $('result');
  el.replaceChildren(renderMarkdown(text, document));
}

async function loadPrefs() {
  try {
    const stored = await chrome.storage.local.get(['type', 'length']);
    if (stored.type) prefs.type = stored.type;
    if (stored.length) prefs.length = stored.length;
  } catch {
    /* storage unavailable: use defaults */
  }
  for (const name of ['type', 'length']) {
    const input = document.querySelector(`input[name="${name}"][value="${prefs[name]}"]`);
    if (input) input.checked = true;
  }
}

async function savePref(key, value) {
  prefs[key] = value;
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch {
    /* ignore */
  }
}

function options() {
  return adapter.buildOptions({
    type: prefs.type,
    length: prefs.length,
    sharedContext: page?.title ? `Web page titled: ${page.title}` : undefined,
  });
}

function showUnavailable(kind) {
  $('unavailable-title').textContent = kind === 'missing' ? "This Chrome doesn't have the Summarizer API" : 'On-device summarizer unavailable';
  $('unavailable-text').textContent =
    kind === 'missing'
      ? 'Update Chrome to version 138 or newer on a desktop computer.'
      : "Chrome reports that this device can't run the built-in summarization model.";
  show('unavailable');
}

function showError(message, title = 'Something went wrong') {
  $('error-text').textContent = message;
  $('state-error').querySelector('h2').textContent = title;
  show('error');
}

function describeError(e) {
  if (e instanceof PageError) return { message: e.message, title: 'Cannot read this page' };
  switch (e?.name) {
    case 'AbortError':
      return { message: 'Cancelled. Press "Summarize again" to retry.', title: 'Cancelled', aborted: true };
    case 'NotSupportedError':
      return {
        message: "Chrome's on-device summarizer doesn't support this page's language or these options yet.",
        title: 'Language not supported',
      };
    case 'NetworkError':
      return { message: 'The model download failed. Check your connection and try again.', title: 'Download failed' };
    case 'QuotaExceededError':
      return { message: 'This page is too long to summarize on-device.', title: 'Page too long' };
    default:
      return { message: String(e?.message || e || 'Unknown error'), title: 'Something went wrong' };
  }
}

function handleError(e, id) {
  if (id !== runId) return;
  const d = describeError(e);
  if (d.aborted && lastText) {
    show('result');
    return;
  }
  showError(d.message, d.title);
}

function newController() {
  controller?.abort();
  controller = new AbortController();
  return controller.signal;
}

async function run({ reextract = true } = {}) {
  const id = ++runId;
  const signal = newController();
  lastText = '';
  $('result').replaceChildren();
  setBusy(true);
  show('loading');
  setLoading('Reading page...');
  try {
    const availability = await adapter.availability(options());
    if (id !== runId) return;
    if (availability === 'missing' || availability === 'unavailable') {
      showUnavailable(availability);
      return;
    }
    if (reextract || !page) {
      const tab = await getTargetTab();
      page = await extractFromTab(tab);
      if (id !== runId) return;
    }
    $('page-title').textContent = page.title || page.url || '';
    if (availability === 'downloadable' || availability === 'downloading') {
      $('download-btn').disabled = false;
      $('download-progress-wrap').hidden = true;
      show('download');
      return;
    }
    await summarizePage(signal, id, null);
  } catch (e) {
    handleError(e, id);
  } finally {
    if (id === runId) setBusy(false);
  }
}

async function onDownloadClick() {
  // create() must be called synchronously from this click handler (transient user activation).
  const id = ++runId;
  const signal = newController();
  $('download-btn').disabled = true;
  $('download-progress-wrap').hidden = false;
  setBusy(true);
  try {
    const created = await adapter.create(options(), {
      signal,
      onProgress: (f) => {
        const pct = Math.round(f * 100);
        $('download-progress').value = pct;
        $('download-progress-text').textContent = `${pct}%`;
      },
    });
    await summarizePage(signal, id, created);
  } catch (e) {
    $('download-btn').disabled = false;
    handleError(e, id);
  } finally {
    if (id === runId) setBusy(false);
  }
}

async function summarizePage(signal, id, preCreated) {
  setLoading('Preparing model...');
  show('loading');
  const s = preCreated ?? (await adapter.create(options(), { signal }));
  summarizer = s;
  let chunkSummarizer = null;
  const context = page.title ? `Page title: ${page.title}` : undefined;
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
          show('loading', 'result');
        } else {
          setLoading(`Summarizing part ${p.index} of ${p.total}...`);
          show('loading');
        }
      },
    });
    if (id !== runId) return;
    renderResult(out);
    show('result');
  } finally {
    adapter.destroy(s);
    adapter.destroy(chunkSummarizer);
    if (summarizer === s) summarizer = null;
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(lastText);
    $('copy-status').textContent = 'Copied to clipboard';
    $('copy-btn').textContent = 'Copied';
  } catch {
    $('copy-status').textContent = 'Copy failed';
    $('copy-btn').textContent = 'Copy failed';
  }
  setTimeout(() => {
    $('copy-btn').textContent = 'Copy';
    $('copy-status').textContent = '';
  }, 1500);
}

async function init() {
  $('controls').addEventListener('submit', (e) => e.preventDefault());
  await loadPrefs();
  for (const input of document.querySelectorAll('#controls input')) {
    input.addEventListener('change', async () => {
      await savePref(input.name, input.value);
      if (page) run({ reextract: false });
    });
  }
  $('again-btn').addEventListener('click', () => run());
  $('copy-btn').addEventListener('click', copy);
  $('cancel-btn').addEventListener('click', () => controller?.abort());
  $('download-btn').addEventListener('click', onDownloadClick);
  run();
}

init();
