// Locating the target tab and extracting its text via chrome.scripting.
export const MSG = {
  noGrant: "To read this tab, click the TL;DR Panel icon in Chrome's toolbar (look under the puzzle-piece menu if you don't see it).",
  internal: "Chrome doesn't let extensions read this kind of page (New Tab, Settings, the Web Store). Open an article or website and try again.",
  pdf: "PDFs can't be summarized yet. Open a web page instead.",
  empty: "There isn't enough text on this page to summarize.",
  file: "To summarize local files, turn on 'Allow access to file URLs' for TL;DR Panel in chrome://extensions.",
  generic: 'Something unexpected happened. Try again, or reload the page.',
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
const FILE_URL = /^file:/i;
const NO_GRANT = /cannot access contents of|must request permission|activetab|missing host permission/i;
const INTERNAL_ERR = /extensions gallery|cannot access a chrome|cannot be scripted|cannot access.*chrome-extension:/i;

/** Text of whatever executeScript rejected with / reported (Error, {message}, string...). */
export function errorText(e) {
  if (!e) return '';
  if (typeof e === 'string') return e;
  if (typeof e.message === 'string') return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return '';
  }
}

/** Map a URL / content type / scripting error to a friendly PageError, or return null when nothing is wrong. */
export function classifyPage({ url, errorMessage, contentType } = {}) {
  if (url) {
    if (INTERNAL_URL.test(url) || WEB_STORE.test(url)) return new PageError(MSG.internal, 'internal');
    if (/\.pdf($|[?#])/i.test(url)) return new PageError(MSG.pdf, 'pdf');
  }
  if (contentType && /pdf/i.test(contentType)) return new PageError(MSG.pdf, 'pdf');
  if (errorMessage) {
    if (INTERNAL_ERR.test(errorMessage)) return new PageError(MSG.internal, 'internal');
    if (url && FILE_URL.test(url)) return new PageError(MSG.file, 'file');
    if (NO_GRANT.test(errorMessage)) return new PageError(MSG.noGrant, 'no-grant');
    return new PageError(MSG.generic, 'other');
  }
  return null;
}

export async function getTargetTab() {
  // Test hook: compiled out of the production build (esbuild define __E2E__=false).
  if (typeof __E2E__ !== 'undefined' && __E2E__) {
    const override = new URLSearchParams(location.search).get('tabId');
    if (override) return chrome.tabs.get(Number(override));
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * Which tab should a run read? An explicit id (toolbar click) wins. Otherwise, if the panel is NOT stale the
 * tab it is already showing; if it IS stale (user switched tabs / navigated) or that tab is gone, the ACTIVE
 * tab, never the old page. `stale` must be the value from before the run reset any UI state.
 */
export async function chooseTab({ tabId = null, stale = false, currentTabId = null }, { getTab, getActive }) {
  if (tabId != null) return getTab(tabId);
  if (!stale && currentTabId != null) {
    try {
      return await getTab(currentTabId);
    } catch {
      /* tab closed: fall through to the active tab */
    }
  }
  return getActive();
}

/**
 * After a run's text was read: should the "you switched pages" banner stay up? True when the user activated a
 * different tab than the one the run read while it was in flight (the result belongs to the older tab).
 */
export function shouldStayStale({ runTabId, activatedTabId }) {
  return activatedTabId != null && runTabId != null && activatedTabId !== runTabId;
}

/**
 * `afterClick`: this run was started by a toolbar click on this tab. Chrome then always grants activeTab, so a
 * no-grant failure on a tab with no readable URL (about:blank and similar) is really an unreadable page.
 */
export async function extractFromTab(tab, { afterClick = false } = {}) {
  if (!tab || tab.id == null) throw new PageError(MSG.noGrant, 'no-grant');
  const early = classifyPage({ url: tab.url });
  if (early) throw early;
  let result;
  try {
    const inject = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['extract.js'] });
    if (inject?.[0]?.error) throw inject[0].error;
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => globalThis.__tldrPanelExtract(),
    });
    if (res?.error) throw res.error;
    result = res?.result;
  } catch (e) {
    const err = classifyPage({ url: tab.url, errorMessage: errorText(e) || 'unknown', contentType: undefined });
    if (afterClick && err.code === 'no-grant' && (!tab.url || /^about:/i.test(tab.url))) throw new PageError(MSG.internal, 'internal');
    throw err;
  }
  if (!result) throw new PageError(MSG.generic, 'other');
  const pdf = classifyPage({ contentType: result.contentType });
  if (pdf) throw pdf;
  if (!result.text || result.text.length < 40) throw new PageError(MSG.empty, 'empty');
  return { ...result, url: tab.url };
}
