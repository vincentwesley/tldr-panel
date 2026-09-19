import { describe, it, expect } from 'vitest';
import { mergeChunk, consumeStream } from '../../src/lib/stream.js';

async function* gen(chunks) {
  for (const c of chunks) yield c;
}
const run = (chunks) => consumeStream(gen(chunks));

describe('stream merging', () => {
  it('handles delta chunks and reports progressive text', async () => {
    const seen = [];
    const out = await consumeStream(gen(['The ', 'quick ', 'fox.']), (t) => seen.push(t));
    expect(out).toBe('The quick fox.');
    expect(seen).toEqual(['The ', 'The quick ', 'The quick fox.']);
  });
  it("treats '*' then '*Key' as deltas (markdown bold start), not cumulative", async () => {
    expect(await run(['*', '*Key', '* point'])).toBe('**Key* point');
  });
  it('keeps repeated tokens and repeated newlines', async () => {
    expect(await run(['ha', 'ha', 'ha'])).toBe('hahaha');
    expect(await run(['\n', '\n', '- a'])).toBe('\n\n- a');
    expect(await run(['ab', 'ab'])).toBe('abab');
  });
  it('handles a real-looking delta sequence including a trailing empty chunk', async () => {
    const parts = ['The', ' city', ' council', ' approved', ' a', ' new', ' bike', '-lane', ' network', '.', ''];
    expect(await run(parts)).toBe('The city council approved a new bike-lane network.');
  });
  it('a delta that repeats the accumulated prefix is not misread once mode is delta', async () => {
    // "the cat" then "the cat sat": ambiguous at first only if the prefix is long; here the 2nd chunk is
    // shorter than acc so the stream is decided as delta and never re-evaluated.
    expect(await run(['The quick brown', ' fox', ' The quick brown fox jumps'])).toBe('The quick brown fox The quick brown fox jumps');
  });
  it('detects a genuinely cumulative stream (long enough first chunk)', async () => {
    const out = await run(['The quick brown', 'The quick brown fox', 'The quick brown fox jumps.']);
    expect(out).toBe('The quick brown fox jumps.');
  });
  it('mergeChunk decisions are sticky', () => {
    const st = { mode: null };
    expect(mergeChunk('', 'abcdefghij', st)).toBe('abcdefghij');
    expect(mergeChunk('abcdefghij', 'abcdefghijkl', st)).toBe('abcdefghijkl');
    expect(st.mode).toBe('cumulative');
    const d = { mode: null };
    expect(mergeChunk('abc', ' def', d)).toBe('abc def');
    expect(d.mode).toBe('delta');
    expect(mergeChunk('abc def', 'abc def ghi', d)).toBe('abc defabc def ghi'); // never re-evaluated
  });
  it('short ambiguous prefix defaults to delta', () => {
    expect(mergeChunk('abc', 'abcdef')).toBe('abcabcdef');
  });
  it('stops on abort', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(consumeStream(gen(['a']), null, ac.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
