// Long-page summarization: measure, split, map (key-points per chunk), reduce, final pass.
// Pure with respect to Chrome: all model access is injected.
import { splitText, CHUNK_BUDGET } from './chunking.js';

export const isQuotaError = (e) => !!e && e.name === 'QuotaExceededError';
const TOO_LONG = 'This page is too long to summarize on-device.';

function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

/**
 * @param {string} text
 * @param {object} deps
 * @param {(t:string)=>Promise<number>} deps.measure  token usage of text
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
  let current = text;

  // Summarize one chunk; on QuotaExceededError re-split using err.quota and retry.
  async function chunkSafe(part, level) {
    try {
      return await summarizeChunk(part);
    } catch (e) {
      if (!isQuotaError(e) || level >= 4) throw e;
      const q = e.quota || quota;
      const ratio = e.requested ? Math.min((q * CHUNK_BUDGET) / e.requested, 0.5) : 0.5;
      const pieces = splitText(part, Math.floor(part.length * ratio) || 1);
      if (pieces.length <= 1) throw e;
      const results = [];
      for (const p of pieces) results.push(await chunkSafe(p, level + 1));
      return results.join('\n');
    }
  }

  async function reduce(src, usageTokens) {
    const maxChars = Math.floor((src.length * quota * CHUNK_BUDGET) / usageTokens);
    const parts = splitText(src, maxChars);
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
        quota = Math.min(quota, e.quota || quota);
        usage = Math.max(usage, e.requested || 0, quota + 1);
      }
    }
    const reduced = await reduce(current, usage);
    if (reduced.length >= current.length) throw new Error(TOO_LONG);
    current = reduced;
  }
  throw new Error(TOO_LONG);
}
