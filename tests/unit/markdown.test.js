// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderMarkdown, toPlainText } from '../../src/lib/markdown.js';

const render = (t) => {
  const div = document.createElement('div');
  div.appendChild(renderMarkdown(t, document));
  return div;
};

describe('renderMarkdown', () => {
  it('renders paragraphs, bullets and bold', () => {
    const el = render('Intro **here**.\n\n- one\n* two **b**\n\nEnd');
    expect(el.querySelectorAll('p')).toHaveLength(2);
    expect(el.querySelectorAll('ul > li')).toHaveLength(2);
    expect(el.querySelector('p strong').textContent).toBe('here');
    expect(el.querySelectorAll('li')[1].querySelector('strong').textContent).toBe('b');
  });
  it('keeps HTML inert (img onerror)', () => {
    const el = render('<img src=x onerror="window.pwned=1"> hello');
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror="window.pwned=1">');
    expect(window.pwned).toBeUndefined();
  });
  it('keeps script text inert', () => {
    const el = render('- <script>window.pwned=1</script>\n**<b>x</b>**');
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('b')).toBeNull();
    expect(el.textContent).toContain('<script>window.pwned=1</script>');
    expect(window.pwned).toBeUndefined();
  });
  it('does not create links from markdown', () => {
    expect(render('[x](javascript:alert(1))').querySelector('a')).toBeNull();
  });
});

describe('renderMarkdown extras', () => {
  it('renders numbered lists, keeping the start number', () => {
    const el = render('1. first\n2. second\n3) third');
    expect(el.querySelectorAll('ol > li')).toHaveLength(3);
    expect(render('3. three\n4. four').querySelector('ol').getAttribute('start')).toBe('3');
  });
  it('renders # headings as bold paragraphs, not headings', () => {
    const el = render('## Key **facts**\nBody');
    expect(el.querySelector('h1,h2,h3')).toBeNull();
    expect(el.querySelector('p strong').textContent).toBe('Key facts');
    expect(el.querySelectorAll('p')).toHaveLength(2);
  });
  it('joins wrapped bullet continuation lines', () => {
    const el = render('- This bullet is long and\n  continues here.\n- Second bullet that wraps\nonto the next line.\n\nAfter.');
    const lis = el.querySelectorAll('li');
    expect(lis).toHaveLength(2);
    expect(lis[0].textContent).toBe('This bullet is long and continues here.');
    expect(lis[1].textContent).toBe('Second bullet that wraps onto the next line.');
    expect(el.querySelectorAll('p')).toHaveLength(1);
  });
  it('a complete-sentence bullet followed by an unindented line starts a paragraph', () => {
    const el = render('- Done.\nSummary line');
    expect(el.querySelectorAll('li')).toHaveLength(1);
    expect(el.querySelector('p').textContent).toBe('Summary line');
  });
  it('stays inert for numbered-list and heading XSS attempts', () => {
    const el = render('1. <img src=x onerror="window.pwned=1">\n# <script>window.pwned=1</script>');
    expect(el.querySelector('img,script')).toBeNull();
    expect(window.pwned).toBeUndefined();
    expect(el.textContent).toContain('<img src=x');
  });
});

describe('toPlainText', () => {
  it('strips bold markers, converts bullets, keeps numbering', () => {
    expect(toPlainText('**Main:** idea\n\n- one\n* two **b**\n1. first\n2. second\n## Head')).toBe('Main: idea\n\n• one\n• two b\n1. first\n2. second\nHead');
  });
});
