// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractPage, MAX_CHARS, PARSE_LIMIT_CHARS } from '../../src/lib/extract.js';
import { splitText } from '../../src/lib/chunking.js';

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

describe('paragraph structure', () => {
  it('keeps blank-line paragraph breaks and list-item newlines from Readability output', () => {
    const doc = make(`<head><title>T</title></head><body><article><h1>Heading</h1>
      <p>${longPara}</p><p>Second paragraph. ${longPara}</p>
      <ul><li>First item</li><li>Second item</li></ul>
      <p>Third paragraph. ${longPara}</p></article></body>`);
    const r = extractPage(doc);
    expect(r.kind).toBe('article');
    const paras = r.text.split(/\n\n/);
    expect(paras.length).toBeGreaterThanOrEqual(4);
    expect(paras.some((p) => p.startsWith('Second paragraph.'))).toBe(true);
    expect(r.text).toMatch(/First item\nSecond item/);
    expect(r.text).not.toMatch(/\n{3,}/);
    expect(splitText(r.text, 500).length).toBeGreaterThan(1); // the chunker can find paragraph boundaries
  });
  it('reports truncation for pages over the cap and does not parse absurdly large DOMs', () => {
    const big = 'x '.repeat(MAX_CHARS / 2 + 100);
    const r = extractPage(make(`<head><title>Big</title></head><body><div>${big}</div></body>`));
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBe(MAX_CHARS);
    const huge = 'y'.repeat(PARSE_LIMIT_CHARS + 10);
    const r2 = extractPage(make(`<head><title>Huge</title></head><body><div>${huge}</div></body>`));
    expect(r2.kind).toBe('body');
    expect(r2.truncated).toBe(true);
  });
});

describe('extractPage selection', () => {
  const sel = (text) => {
    const doc = make(`<head><title>T</title></head><body><article><p id="p">${text}</p><p>${longPara}</p><p>${longPara}</p><p>${longPara}</p></article></body>`);
    const r = doc.createRange();
    r.selectNodeContents(doc.getElementById('p'));
    doc.defaultView.getSelection().removeAllRanges();
    doc.defaultView.getSelection().addRange(r);
    return doc;
  };
  it('returns only a long selection', () => {
    const text = 'Selected sentence about harbours and ferries. '.repeat(5);
    const r = extractPage(sel(text));
    expect(r.kind).toBe('selection');
    expect(r.text).toBe(text.trim());
    expect(r.text).not.toContain('committee');
  });
  it('ignores a short selection and the selection in whole-page mode', () => {
    expect(extractPage(sel('too short')).kind).not.toBe('selection');
    expect(extractPage(sel('Selected sentence about harbours. '.repeat(8)), { mode: 'page' }).kind).not.toBe('selection');
  });
  it('a whitespace / nbsp / zero-width-only selection falls back to the page', () => {
    for (const junk of ['  ​\n'.repeat(300), '​'.repeat(400), ' '.repeat(400)]) {
      const doc = sel(junk);
      const r = extractPage(doc);
      expect(r.kind).not.toBe('selection');
      expect(r.text).toContain('committee reviewed');
    }
  });
  it('caps a huge selection at MAX_CHARS and flags truncation', () => {
    const r = extractPage(sel('x '.repeat(MAX_CHARS)));
    expect(r.kind).toBe('selection');
    expect(r.text.length).toBe(MAX_CHARS);
    expect(r.truncated).toBe(true);
  });
});
