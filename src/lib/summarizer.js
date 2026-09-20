// Thin adapter over Chrome's built-in Summarizer API so tests can inject a fake globalThis.Summarizer.
export const isSupported = () => typeof globalThis.Summarizer !== 'undefined';

export function buildOptions({ type = 'tldr', length = 'medium', format = 'markdown', sharedContext, outputLanguage = 'en', expectedInputLanguages = ['en'] } = {}) {
  const o = { type, length, format, outputLanguage, expectedInputLanguages: [...expectedInputLanguages] };
  if (sharedContext) o.sharedContext = sharedContext;
  return o;
}

/** Returns 'missing' when the API does not exist, else Chrome's availability string. */
export async function availability(opts) {
  if (!isSupported()) return 'missing';
  return globalThis.Summarizer.availability(opts);
}

/** onProgress receives a 0..1 fraction. Must be called from a user gesture when a download is needed. */
export function create(opts, { onProgress, signal } = {}) {
  return globalThis.Summarizer.create({
    ...opts,
    signal,
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => onProgress?.(e.loaded));
    },
  });
}

export const summarize = (s, text, { context, signal } = {}) => s.summarize(text, { context, signal });
export const stream = (s, text, { context, signal } = {}) => s.summarizeStreaming(text, { context, signal });
export const measureInputUsage = (s, text) => s.measureInputUsage(text);
export const inputQuota = (s) => s.inputQuota;
export function destroy(s) {
  try {
    s?.destroy?.();
  } catch {
    /* ignore */
  }
}
