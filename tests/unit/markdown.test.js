// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../src/lib/markdown.js';

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
