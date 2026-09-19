import { describe, it, expect } from 'vitest';
import { splitText } from '../../src/lib/chunking.js';

const para = (n, w) => Array.from({ length: n }, (_, i) => `Sentence ${i} of ${w}.`).join(' ');

describe('splitText', () => {
  it('returns one chunk when text fits', () => {
    expect(splitText('Hello world.\n\nSecond para.', 100)).toEqual(['Hello world.\n\nSecond para.']);
  });
  it('never exceeds the limit and preserves all content', () => {
    const text = [para(20, 'a'), para(20, 'b'), para(20, 'c')].join('\n\n');
    const chunks = splitText(text, 300);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(300);
    const words = (s) => s.split(/\s+/).filter(Boolean);
    expect(words(chunks.join(' '))).toEqual(words(text));
  });
  it('prefers paragraph boundaries', () => {
    const chunks = splitText('AAAA AAAA.\n\nBBBB BBBB.\n\nCCCC CCCC.', 25);
    expect(chunks).toEqual(['AAAA AAAA.\n\nBBBB BBBB.', 'CCCC CCCC.']);
  });
  it('splits long sentences without punctuation on words, then hard', () => {
    const chunks = splitText('word '.repeat(100).trim(), 50);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(50);
    const noSpaces = splitText('x'.repeat(130), 50);
    expect(noSpaces.map((c) => c.length)).toEqual([50, 50, 30]);
  });
  it('handles empty input', () => {
    expect(splitText('   \n\n  ', 10)).toEqual([]);
  });
});
