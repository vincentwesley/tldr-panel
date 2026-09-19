// Chrome streams Summarizer output as DELTAS (verified in Chrome 153). Older/other builds were
// documented as cumulative, so we keep a conservative, sticky detector: a stream is only ever
// declared cumulative when a later chunk is strictly longer than, and starts with, an already
// substantial accumulated text (>= MIN_CUMULATIVE_PREFIX chars). Once decided it is never revisited.
export const MIN_CUMULATIVE_PREFIX = 8;

export const newMergeState = () => ({ mode: null }); // null (undecided) | 'delta' | 'cumulative'

export function mergeChunk(acc, chunk, state = newMergeState()) {
  if (!acc) return chunk; // first chunk: nothing to compare with
  if (state.mode === 'cumulative') return chunk;
  if (state.mode === 'delta') return acc + chunk;
  const extendsAcc = chunk.length > acc.length && chunk.startsWith(acc);
  if (!extendsAcc) {
    state.mode = 'delta'; // definitely not cumulative
    return acc + chunk;
  }
  if (acc.length >= MIN_CUMULATIVE_PREFIX) {
    state.mode = 'cumulative';
    return chunk;
  }
  return acc + chunk; // ambiguous short prefix: default to delta, stay undecided
}

/** Consume an async-iterable stream, calling onText(accumulatedText) after each chunk. */
export async function consumeStream(stream, onText, signal) {
  let acc = '';
  const state = newMergeState();
  for await (const chunk of stream) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    acc = mergeChunk(acc, String(chunk), state);
    onText?.(acc);
  }
  return acc;
}
