// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { classifyPage, extractFromTab, errorText, MSG, PageError } from '../../src/lib/page.js';

afterEach(() => vi.unstubAllGlobals());

describe('classifyPage', () => {
  it('flags internal pages, the web store and PDFs by URL', () => {
    expect(classifyPage({ url: 'chrome://extensions' }).message).toBe(MSG.internal);
    expect(classifyPage({ url: 'https://chromewebstore.google.com/detail/x' }).code).toBe('internal');
    expect(classifyPage({ url: 'https://example.com/paper.pdf' }).code).toBe('pdf');
    expect(classifyPage({ url: 'https://example.com/a' })).toBeNull();
  });
  it('claims PDF only when the URL or content type says so', () => {
    expect(classifyPage({ contentType: 'application/pdf' }).code).toBe('pdf');
    expect(classifyPage({ url: 'https://example.com/a', errorMessage: 'weird' }).code).toBe('other');
    expect(classifyPage({ contentType: 'text/html' })).toBeNull();
  });
  it('maps missing activeTab grant errors to the friendly message', () => {
    const e = classifyPage({
      url: 'https://example.com/',
      errorMessage: 'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
    });
    expect(e.message).toBe(MSG.noGrant);
    expect(classifyPage({ errorMessage: 'The extensions gallery cannot be scripted.' }).code).toBe('internal');
    expect(classifyPage({ errorMessage: 'Cannot access a chrome:// URL' }).code).toBe('internal');
  });
  it('does not let unrelated errors match the no-grant text and never leaks the raw string', () => {
    for (const m of ['Frame with ID 0 was removed.', 'No tab with id: 5.', 'permission denied by the model', 'The tab was closed.']) {
      const e = classifyPage({ url: 'https://example.com/', errorMessage: m });
      expect(e.code).toBe('other');
      expect(e.message).toBe(MSG.generic);
      expect(e.message).not.toContain(m);
    }
  });
  it('explains that file: URLs need "Allow access to file URLs"', () => {
    const e = classifyPage({ url: 'file:///C:/docs/a.html', errorMessage: 'Cannot access contents of url "file:///C:/docs/a.html". Extension manifest must request permission' });
    expect(e.code).toBe('file');
    expect(e.message).toContain('Allow access to file URLs');
  });
});

describe('errorText', () => {
  it('handles Error, plain objects, strings and junk', () => {
    expect(errorText(new Error('a'))).toBe('a');
    expect(errorText({ message: 'b' })).toBe('b');
    expect(errorText('c')).toBe('c');
    expect(errorText({ code: 1 })).toBe('{"code":1}');
    expect(errorText(undefined)).toBe('');
  });
});

describe('extractFromTab', () => {
  const stub = (executeScript) => vi.stubGlobal('chrome', { scripting: { executeScript } });
  const tab = { id: 3, url: 'https://example.com/a' };
  const okResult = { text: 'x'.repeat(100), title: 'T', contentType: 'text/html' };

  it('returns the extraction with the tab url', async () => {
    stub(vi.fn().mockResolvedValueOnce([{ result: null }]).mockResolvedValueOnce([{ result: okResult }]));
    const r = await extractFromTab(tab);
    expect(r.url).toBe(tab.url);
  });
  it('treats an error object reported inside the result array like a rejection', async () => {
    stub(vi.fn().mockResolvedValueOnce([{ error: { message: 'Cannot access contents of the page. Extension manifest must request permission' } }]));
    await expect(extractFromTab(tab)).rejects.toMatchObject({ code: 'no-grant' });
  });
  it('handles a rejection with a plain string', async () => {
    stub(vi.fn().mockRejectedValue('The extensions gallery cannot be scripted.'));
    await expect(extractFromTab(tab)).rejects.toMatchObject({ code: 'internal' });
  });
  it('does not claim PDF when the extractor returns nothing', async () => {
    stub(vi.fn().mockResolvedValueOnce([{ result: null }]).mockResolvedValueOnce([{ result: undefined }]));
    const e = await extractFromTab(tab).catch((x) => x);
    expect(e).toBeInstanceOf(PageError);
    expect(e.code).toBe('other');
  });
  it('flags PDFs by content type, and short text as empty', async () => {
    stub(vi.fn().mockResolvedValueOnce([{}]).mockResolvedValueOnce([{ result: { ...okResult, contentType: 'application/pdf' } }]));
    await expect(extractFromTab(tab)).rejects.toMatchObject({ code: 'pdf' });
    stub(vi.fn().mockResolvedValueOnce([{}]).mockResolvedValueOnce([{ result: { ...okResult, text: 'short' } }]));
    await expect(extractFromTab(tab)).rejects.toMatchObject({ code: 'empty' });
  });
  it('a missing tab means no grant; internal tabs never reach executeScript', async () => {
    const ex = vi.fn();
    stub(ex);
    await expect(extractFromTab(undefined)).rejects.toMatchObject({ code: 'no-grant' });
    await expect(extractFromTab({ id: 1, url: 'chrome://settings' })).rejects.toMatchObject({ code: 'internal' });
    expect(ex).not.toHaveBeenCalled();
  });
});
