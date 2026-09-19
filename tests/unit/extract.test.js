// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractPage } from '../../src/lib/extract.js';
import { classifyPage, MSG } from '../../src/lib/page.js';

const make = (html) => {
  document.documentElement.innerHTML = html;
  return document;
};
const longPara = 'The committee reviewed the proposal in detail and asked several questions about funding. '.repeat(4);

describe('extractPage', () => {
  it('uses Readability for article pages and drops chrome', () => {
    const doc = make(`<head><title>Big News</title></head><body>
      <nav>Home | About | Contact NAVTEXT</nav>
      <article><h1>Big News</h1><p>${longPara}</p><p>${longPara}</p><p>${longPara}</p></article>
      <footer>FOOTERTEXT</footer></body>`);
    const r = extractPage(doc);
    expect(r.title).toBe('Big News');
    expect(r.kind).toBe('article');
    expect(r.text).toContain('committee reviewed');
    expect(r.text).not.toContain('FOOTERTEXT');
  });
  it('falls back to body text when Readability finds nothing', () => {
    const doc = make('<head><title>App</title></head><body><div>Dashboard: 12 items pending review, 3 overdue.</div></body>');
    const r = extractPage(doc);
    expect(r.kind).toBe('body');
    expect(r.text).toContain('12 items pending');
  });
  it('returns empty text for an empty page', () => {
    const r = extractPage(make('<head><title>Empty</title></head><body></body>'));
    expect(r.text).toBe('');
  });
  it('does not mutate the live document', () => {
    const doc = make(`<head><title>T</title></head><body><nav>NAV</nav><article><p>${longPara}</p><p>${longPara}</p></article></body>`);
    extractPage(doc);
    expect(doc.querySelector('nav')).not.toBeNull();
  });
});

describe('classifyPage', () => {
  it('flags internal pages, the web store and PDFs by URL', () => {
    expect(classifyPage({ url: 'chrome://extensions' }).message).toBe(MSG.internal);
    expect(classifyPage({ url: 'https://chromewebstore.google.com/detail/x' }).code).toBe('internal');
    expect(classifyPage({ url: 'https://example.com/paper.pdf' }).code).toBe('pdf');
    expect(classifyPage({ url: 'https://example.com/a' })).toBeNull();
  });
  it('maps missing activeTab grant errors to the friendly message', () => {
    const e = classifyPage({
      errorMessage: 'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
    });
    expect(e.message).toBe(MSG.noGrant);
    expect(classifyPage({ errorMessage: 'The extensions gallery cannot be scripted.' }).code).toBe('internal');
    expect(classifyPage({ errorMessage: 'Frame with ID 0 was removed.' }).code).toBe('other');
  });
});
