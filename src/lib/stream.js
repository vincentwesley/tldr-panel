// Chrome builds differ: streamed chunks are either deltas or cumulative text.
export function mergeChunk(acc, chunk) {
  if (acc && chunk.length >= acc.length && chunk.startsWith(acc)) return chunk; // cumulative
  return acc + chunk; // delta
}

/** Consume an async-iterable stream, calling onText(accumulatedText) after each chunk. */
export async function consumeStream(stream, onText, signal) {
  let acc = '';
  for await (const chunk of stream) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    acc = mergeChunk(acc, String(chunk));
    onText?.(acc);
  }
  return acc;
}
