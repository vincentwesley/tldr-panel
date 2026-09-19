import { describe, it, expect, vi } from 'vitest';
import { summarizeLong } from '../../src/lib/pipeline.js';

// Fake tokenizer: 1 token per 4 chars.
const measure = async (t) => Math.ceil(t.length / 4);
const quotaError = (requested, quota) => Object.assign(new Error('quota'), { name: 'QuotaExceededError', requested, quota });
const sentences = (n) => Array.from({ length: n }, (_, i) => `This is sentence number ${i}.`).join(' ');

describe('summarizeLong', () => {
  it('goes straight to the final pass when input fits', async () => {
    const summarizeChunk = vi.fn();
    const summarizeFinal = vi.fn(async () => 'final');
    const out = await summarizeLong('short text', { measure, quota: 1000, summarizeChunk, summarizeFinal });
    expect(out).toBe('final');
    expect(summarizeChunk).not.toHaveBeenCalled();
  });

  it('chunks long input, reports progress, then runs the final pass', async () => {
    const text = Array.from({ length: 40 }, (_, i) => `Paragraph ${i}. ` + sentences(5)).join('\n\n');
    const progress = [];
    const chunkInputs = [];
    const summarizeChunk = async (t) => {
      chunkInputs.push(t);
      return '- point';
    };
    const summarizeFinal = vi.fn(async (t) => `final(${t.length})`);
    const out = await summarizeLong(text, {
      measure,
      quota: 500,
      summarizeChunk,
      summarizeFinal,
      onProgress: (p) => progress.push(p),
    });
    expect(out).toMatch(/^final/);
    expect(chunkInputs.length).toBeGreaterThan(1);
    for (const c of chunkInputs) expect(await measure(c)).toBeLessThanOrEqual(500 * 0.7 + 5);
    expect(progress[0]).toEqual({ index: 1, total: chunkInputs.length });
    expect(progress.at(-1)).toEqual({ final: true });
    expect(await measure(summarizeFinal.mock.calls[0][0])).toBeLessThanOrEqual(500);
  });

  it('recurses when joined chunk summaries are still too big', async () => {
    const text = Array.from({ length: 60 }, (_, i) => `P${i}. ` + sentences(6)).join('\n\n');
    const summarizeChunk = vi.fn(async (t) => t.slice(0, Math.ceil(t.length / 2))); // weak reduction
    const summarizeFinal = vi.fn(async () => 'done');
    const out = await summarizeLong(text, { measure, quota: 300, summarizeChunk, summarizeFinal });
    expect(out).toBe('done');
    expect(summarizeChunk.mock.calls.length).toBeGreaterThan(5);
  });

  it('retries with smaller pieces on QuotaExceededError using err.quota', async () => {
    const text = Array.from({ length: 60 }, (_, i) => `Para ${i}. ` + sentences(4)).join('\n\n');
    const seen = [];
    // Model is secretly stricter than reported: real quota 100 tokens.
    const summarizeChunk = async (t) => {
      const tokens = await measure(t);
      seen.push(tokens);
      if (tokens > 100) throw quotaError(tokens, 100);
      return '- ok';
    };
    const summarizeFinal = vi.fn(async () => 'final');
    const out = await summarizeLong(text, { measure, quota: 1000, summarizeChunk, summarizeFinal });
    expect(out).toBe('final');
    expect(seen.some((n) => n > 100)).toBe(true); // hit the error at least once
    expect(seen.at(-1)).toBeLessThanOrEqual(100);
  });

  it('shrinks the quota when the final pass throws QuotaExceededError', async () => {
    const text = Array.from({ length: 10 }, (_, i) => `P${i}. ` + sentences(4)).join('\n\n');
    let calls = 0;
    const summarizeFinal = async (t) => {
      calls++;
      if (calls === 1) throw quotaError(await measure(t), 200);
      return 'final2';
    };
    const out = await summarizeLong(text, { measure, quota: 5000, summarizeChunk: async () => '- k', summarizeFinal });
    expect(out).toBe('final2');
    expect(calls).toBe(2);
  });

  it('gives up if an unsplittable chunk keeps exceeding quota', async () => {
    await expect(
      summarizeLong('x'.repeat(4000), {
        measure,
        quota: 100,
        summarizeChunk: async (t) => {
          throw quotaError(await measure(t), 10);
        },
        summarizeFinal: async () => 'never',
      }),
    ).rejects.toMatchObject({ name: 'QuotaExceededError' });
  });

  it('propagates non-quota errors from the chunk pass', async () => {
    const text = 'a. '.repeat(2000);
    await expect(
      summarizeLong(text, {
        measure,
        quota: 50,
        summarizeChunk: async () => {
          throw new Error('boom');
        },
        summarizeFinal: async () => 'x',
      }),
    ).rejects.toThrow('boom');
  });

  it('honours an already-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      summarizeLong('hi', { measure, quota: 50, summarizeChunk: async () => '', summarizeFinal: async () => 'x', signal: ac.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('summarizeLong guards', () => {
  const deps = { measure, summarizeChunk: async () => '- k', summarizeFinal: async () => 'final' };
  it.each([NaN, Infinity, 0, -5, undefined, '100'])('rejects an unusable quota (%s)', async (q) => {
    await expect(summarizeLong('text', { ...deps, quota: q })).rejects.toMatchObject({ name: 'BadQuotaError' });
  });
  it('fails with TooLongError when chunks would be tiny (quota too small for the overhead)', async () => {
    const overhead = async (t) => 500 + Math.ceil(t.length / 4);
    await expect(
      summarizeLong('word '.repeat(5000), { ...deps, measure: overhead, quota: 600 }),
    ).rejects.toMatchObject({ name: 'TooLongError' });
  });
  it('fails with TooLongError instead of thousands of model calls', async () => {
    const chunk = vi.fn(async () => '- k');
    // quota 130 tokens => ~360-char chunks; 500k chars would need >1000 chunks
    await expect(
      summarizeLong('Sentence here. '.repeat(30000), { ...deps, measure, quota: 130, summarizeChunk: chunk }),
    ).rejects.toMatchObject({ name: 'TooLongError' });
    expect(chunk).not.toHaveBeenCalled(); // rejected up front, before any call
  });
  it('caps total chunk calls across recursion', async () => {
    const chunk = vi.fn(async (t) => t.slice(0, Math.ceil(t.length * 0.95))); // barely reduces, many passes
    await expect(
      summarizeLong('Sentence here. '.repeat(1200), { ...deps, measure, quota: 130, summarizeChunk: chunk, maxDepth: 50 }),
    ).rejects.toMatchObject({ name: 'TooLongError' });
    expect(chunk.mock.calls.length).toBeLessThanOrEqual(150);
  });
  it('sizes chunks from the fixed request overhead (~500 tokens), not a naive chars-per-token guess', async () => {
    // real model: 'hello world' = 511 tokens, ~0.173 tokens/char marginal, quota 9216
    const real = async (t) => 500 + Math.ceil(t.length * 0.173);
    const text = Array.from({ length: 400 }, (_, i) => `Paragraph ${i}. ` + 'The council met and discussed the plan in detail. '.repeat(8)).join('\n\n');
    const inputs = [];
    await summarizeLong(text, {
      measure: real,
      quota: 9216,
      summarizeChunk: async (t) => (inputs.push(t), '- k'),
      summarizeFinal: async () => 'final',
    });
    expect(inputs.length).toBeGreaterThan(1);
    for (const t of inputs) expect(await real(t)).toBeLessThanOrEqual(9216 * 0.7 + 50);
  });
  it('a chunk that exceeds the quota is re-split (retry ratio clamped to >= 0.1)', async () => {
    const seen = [];
    const summarizeChunk = async (t) => {
      seen.push(t.length);
      if (seen.length === 1) throw quotaError(1e9, 1000); // absurd request size => clamp, not 0-length pieces
      return '- k';
    };
    const text = Array.from({ length: 30 }, (_, i) => `P${i}. ` + sentences(5)).join('\n\n');
    await summarizeLong(text, { ...deps, measure, quota: 300, summarizeChunk });
    expect(seen.length).toBeGreaterThan(3); // split into several pieces, not one giant or zero-length ones
    expect(seen[1]).toBeGreaterThan(0);
    expect(seen[1]).toBeLessThanOrEqual(seen[0] * 0.1 + 1); // first retry piece honours the clamped 0.1 ratio
  });
});
