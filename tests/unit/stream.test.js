import { describe, it, expect } from 'vitest';
import { mergeChunk, consumeStream } from '../../src/lib/stream.js';

async function* gen(chunks) {
  for (const c of chunks) yield c;
}

describe('stream merging', () => {
  it('handles delta chunks', async () => {
    const seen = [];
    const out = await consumeStream(gen(['The ', 'quick ', 'fox.']), (t) => seen.push(t));
    expect(out).toBe('The quick fox.');
    expect(seen).toEqual(['The ', 'The quick ', 'The quick fox.']);
  });
  it('handles cumulative chunks', async () => {
    const out = await consumeStream(gen(['The', 'The quick', 'The quick fox.']));
    expect(out).toBe('The quick fox.');
  });
  it('mergeChunk distinguishes the two modes', () => {
    expect(mergeChunk('', 'abc')).toBe('abc');
    expect(mergeChunk('abc', 'abcdef')).toBe('abcdef');
    expect(mergeChunk('abc', ' def')).toBe('abc def');
  });
  it('stops on abort', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(consumeStream(gen(['a']), null, ac.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
