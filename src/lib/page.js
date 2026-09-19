// Locating the target tab and extracting its text via chrome.scripting.
export const MSG = {
  noGrant: 'Click the TL;DR Panel toolbar icon on this tab to summarize it.',
  internal: "Chrome doesn't let extensions read its own pages (chrome://, about:, the Web Store). Open a regular web page and try again.",
  pdf: "PDF files can't be summarized yet. Open a regular web page and try again.",
  empty: "This page doesn't have enough readable text to summarize.",
};

export class PageError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PageError';
    this.code = code;
  }
}

const INTERNAL_URL = /^(chrome|chrome-extension|edge|about|devtools|view-source|chrome-untrusted):/i;
const WEB_STORE = /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/i;

/** Map a URL / scripting error to a friendly PageError, or return null when nothing is wrong. */
export function classifyPage({ url, errorMessage } = {}) {
  if (url) {
    if (INTERNAL_URL.test(url) || WEB_STORE.test(url)) return new PageError(MSG.internal, 'internal');
    if (/\.pdf($|[?#])/i.test(url)) return new PageError(MSG.pdf, 'pdf');
  }
  if (errorMessage) {
    if (/chrome:\/\/|extensions gallery|cannot be scripted|chrome-extension:\/\//i.test(errorMessage)) {
      return new PageError(MSG.internal, 'internal');
    }
    if (/cannot access|activeTab|permission|host permission/i.test(errorMessage)) {
      return new PageError(MSG.noGrant, 'no-grant');
    }
    return new PageError(`Couldn't read this page: ${errorMessage}`, 'other');
  }
  return null;
}

export async function getTargetTab(search = location.search) {
  const override = new URLSearchParams(search).get('tabId');
  if (override) return chrome.tabs.get(Number(override));
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

export async function extractFromTab(tab) {
  if (!tab || tab.id == null) throw new PageError(MSG.noGrant, 'no-grant');
  const early = classifyPage({ url: tab.url });
  if (early) throw early;
  let result;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['extract.js'] });
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => globalThis.__tldrPanelExtract(),
    });
    result = res?.result;
  } catch (e) {
    throw classifyPage({ url: tab.url, errorMessage: String(e?.message || e) });
  }
  if (!result) throw new PageError(MSG.pdf, 'pdf');
  if (/pdf/i.test(result.contentType)) throw new PageError(MSG.pdf, 'pdf');
  if (!result.text || result.text.length < 40) throw new PageError(MSG.empty, 'empty');
  return { ...result, url: tab.url };
}
