// Page text extraction. Runs inside the target page (injected) and in jsdom tests.
import { Readability, isProbablyReaderable } from '@mozilla/readability';
import { pickSelection, MODE_AUTO } from './selection.js';

export const MIN_ARTICLE_CHARS = 200;
export const MAX_CHARS = 120000;
/** Above this much raw text we skip Readability (cloning + parsing a giant DOM is slow) and just slice body text. */
export const PARSE_LIMIT_CHARS = 2000000;

const clean = (s) =>
  String(s || '')
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const BLOCK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'TABLE', 'FIGURE', 'FIGCAPTION', 'UL', 'OL', 'HEADER', 'FOOTER', 'ASIDE']);
const LINE = new Set(['LI', 'TR', 'DT', 'DD']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

/** Text of a node keeping paragraph structure: blank line between blocks, single newline between list items. */
export function structuredText(root) {
  let out = '';
  const walk = (n) => {
    if (n.nodeType === 3) {
      out += n.nodeValue.replace(/\s+/g, ' ');
    } else if (n.nodeType === 1) {
      const tag = n.tagName;
      if (SKIP.has(tag)) return;
      if (tag === 'BR') {
        out += '\n';
        return;
      }
      const sep = BLOCK.has(tag) ? '\n\n' : '';
      out += sep || (LINE.has(tag) ? '\n' : ''); // list items / rows: newline before only, so they stay adjacent
      for (const c of n.childNodes) walk(c);
      out += sep;
    }
  };
  walk(root);
  return out;
}

/** Text the user has selected in this (top) frame. Selections inside iframes are not visible from here. */
function readSelection(doc) {
  try {
    return doc.defaultView?.getSelection?.()?.toString() ?? '';
  } catch {
    return '';
  }
}

export function extractPage(doc, { mode = MODE_AUTO } = {}) {
  const title = (doc.title || '').trim();
  const lang = doc.documentElement?.lang || '';
  const contentType = doc.contentType || '';
  const selected = pickSelection(readSelection(doc), mode);
  if (selected) {
    // Same cap as the page path; the panel runs it through the same chunking pipeline.
    const truncated = selected.length > MAX_CHARS;
    return { title, lang, text: truncated ? selected.slice(0, MAX_CHARS) : selected, kind: 'selection', truncated, contentType };
  }
  const rawLen = doc.body?.textContent?.length ?? 0;
  let text = '';
  let kind = 'article';
  if (rawLen <= PARSE_LIMIT_CHARS) {
    try {
      if (isProbablyReaderable(doc)) {
        const article = new Readability(doc.cloneNode(true)).parse();
        if (article?.content) {
          const parsed = new DOMParser().parseFromString(article.content, 'text/html');
          text = clean(structuredText(parsed.body));
        }
        if (!text && article?.textContent) text = clean(article.textContent);
      }
    } catch {
      text = '';
    }
  }
  if (text.length < MIN_ARTICLE_CHARS) {
    const body = doc.body;
    const fallback = clean(body ? (body.innerText ?? body.textContent) : '');
    if (fallback.length > text.length) {
      text = fallback;
      kind = 'body';
    }
  }
  const truncated = text.length > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS);
  return { title, lang, text, kind, truncated, contentType };
}
