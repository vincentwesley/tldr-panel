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

  it('propagates non-quota errors and honours abort', async () => {
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
    const ac = new AbortController();
    ac.abort();
    await expect(
      summarizeLong('hi', { measure, quota: 50, summarizeChunk: async () => '', summarizeFinal: async () => 'x', signal: ac.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
