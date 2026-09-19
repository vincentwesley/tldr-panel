// Pure text-splitting helpers. No DOM, no Chrome APIs.

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;

/** Fraction of the input quota a single chunk may use. */
export const CHUNK_BUDGET = 0.7;

/** Split text into pieces no longer than maxChars, preferring paragraph, then sentence, then word boundaries. */
export function splitText(text, maxChars) {
  const limit = Math.max(1, Math.floor(maxChars));
  const units = [];
  for (const para of text.split(/\n{2,}/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length <= limit) {
      units.push(p);
      continue;
    }
    for (const sentence of p.split(SENTENCE_SPLIT)) {
      if (sentence.length <= limit) units.push(sentence);
      else units.push(...hardSplit(sentence, limit));
    }
  }
  // Greedily pack units into chunks.
  const chunks = [];
  let cur = '';
  for (const u of units) {
    if (!cur) cur = u;
    else if (cur.length + 2 + u.length <= limit) cur += '\n\n' + u;
    else {
      chunks.push(cur);
      cur = u;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

function hardSplit(s, limit) {
  const out = [];
  let rest = s;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf(' ', limit);
    if (cut < limit * 0.5) cut = limit;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}
