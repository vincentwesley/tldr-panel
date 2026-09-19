// Long-page summarization: measure, split, map (key-points per chunk), reduce, final pass.
// Pure with respect to Chrome: all model access is injected.
import { splitText, CHUNK_BUDGET, MIN_CHUNK_CHARS } from './chunking.js';

export const isQuotaError = (e) => !!e && e.name === 'QuotaExceededError';
/** Max chunks in a single map pass and max chunk-summarize calls for the whole run. */
export const MAX_CHUNKS_PER_PASS = 60;
export const MAX_CHUNK_CALLS = 150;
const MIN_RETRY_RATIO = 0.1;

function tooLong() {
  const e = new Error('This page is too long to summarize on-device.');
  e.name = 'TooLongError';
  return e;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

/**
 * @param {string} text
 * @param {object} deps
 * @param {(t:string)=>Promise<number>} deps.measure  token usage of text (includes the model's fixed overhead)
 * @param {number} deps.quota                         input quota in tokens
 * @param {(t:string)=>Promise<string>} deps.summarizeChunk  key-points pass for one chunk
 * @param {(t:string)=>Promise<string>} deps.summarizeFinal  the user's chosen type/length
 * @param {(p:{index:number,total:number}|{final:true})=>void} [deps.onProgress]
 * @param {AbortSignal} [deps.signal]
 */
export async function summarizeLong(text, deps) {
  const { measure, summarizeChunk, summarizeFinal, onProgress, signal } = deps;
  const maxDepth = deps.maxDepth ?? 5;
  let quota = deps.quota;
  if (!Number.isFinite(quota) || quota <= 0) {
    const e = new Error('The on-device model reported an unusable input limit.');
    e.name = 'BadQuotaError';
    throw e;
  }
  let current = text;
  let calls = 0;
  // Real models add a fixed token overhead per request (~500 measured), so tokens are NOT proportional
  // to characters. Measure that overhead once and size chunks from the marginal tokens per character.
  let base = null;

  // Summarize one chunk; on QuotaExceededError re-split using err.quota and retry.
  async function chunkSafe(part, level) {
    if (++calls > MAX_CHUNK_CALLS) throw tooLong();
    try {
      return await summarizeChunk(part);
    } catch (e) {
      if (!isQuotaError(e) || level >= 4) throw e;
      const q = Number.isFinite(e.quota) && e.quota > 0 ? e.quota : quota;
      const raw = e.requested > 0 ? (q * CHUNK_BUDGET) / e.requested : 0.5;
      const ratio = Math.min(Math.max(raw, MIN_RETRY_RATIO), 0.5);
      const pieces = splitText(part, Math.floor(part.length * ratio) || 1);
      if (pieces.length <= 1) throw e;
      const results = [];
      for (const p of pieces) results.push(await chunkSafe(p, level + 1));
      return results.join('\n');
    }
  }

  async function reduce(src, usageTokens) {
    base ??= Math.max(0, Number(await measure('a')) || 0);
    const perChar = Math.max(usageTokens - base, 1) / Math.max(src.length, 1);
    const maxChars = Math.floor((quota * CHUNK_BUDGET - base) / perChar);
    if (!Number.isFinite(maxChars) || maxChars < MIN_CHUNK_CHARS) throw tooLong();
    const parts = splitText(src, maxChars);
    if (parts.length > MAX_CHUNKS_PER_PASS) throw tooLong();
    const out = [];
    for (let i = 0; i < parts.length; i++) {
      throwIfAborted(signal);
      onProgress?.({ index: i + 1, total: parts.length });
      out.push(await chunkSafe(parts[i], 0));
    }
    return out.join('\n\n');
  }

  for (let depth = 0; depth <= maxDepth; depth++) {
    throwIfAborted(signal);
    let usage = await measure(current);
    if (usage <= quota) {
      try {
        onProgress?.({ final: true });
        return await summarizeFinal(current);
      } catch (e) {
        if (!isQuotaError(e)) throw e;
        if (Number.isFinite(e.quota) && e.quota > 0) quota = Math.min(quota, e.quota);
        usage = Math.max(usage, e.requested || 0, quota + 1);
      }
    }
    const reduced = await reduce(current, usage);
    if (reduced.length >= current.length) throw tooLong();
    current = reduced;
  }
  throw tooLong();
}
