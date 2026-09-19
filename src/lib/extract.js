// Page text extraction. Runs inside the target page (injected) and in jsdom tests.
import { Readability, isProbablyReaderable } from '@mozilla/readability';

export const MIN_ARTICLE_CHARS = 200;
export const MAX_CHARS = 500000;

const clean = (s) =>
  String(s || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export function extractPage(doc) {
  const title = (doc.title || '').trim();
  const lang = doc.documentElement?.lang || '';
  let text = '';
  let kind = 'article';
  try {
    if (isProbablyReaderable(doc)) {
      const article = new Readability(doc.cloneNode(true)).parse();
      if (article && article.textContent) text = clean(article.textContent);
    }
  } catch {
    text = '';
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
  return { title, lang, text, kind, truncated, contentType: doc.contentType || '' };
}
