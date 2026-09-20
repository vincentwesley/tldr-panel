// Output-language logic. Pure: no Chrome APIs. UI chrome text stays English; only the summary language varies.

/**
 * Output languages offered in the picker. EDIT THIS LIST ONLY. Verified empirically in real Chrome 153 (2026-09-20):
 * Summarizer.availability() said 'available' for exactly en, es, ja, fr, de (as output and as input language) and
 * 'unavailable' for pt, it, ko, zh, hi, ar, ru; a real summarize() was run for fr, de, es and ja. See DECISIONS.md.
 * name = what the picker shows (native name first so speakers can find it).
 */
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Espa\u00f1ol (Spanish)' },
  { code: 'ja', name: '\u65e5\u672c\u8a9e (Japanese)' },
  { code: 'fr', name: 'Fran\u00e7ais (French)' },
  { code: 'de', name: 'Deutsch (German)' },
];

export const AUTO = 'auto';
export const SUPPORTED = LANGUAGES.map((l) => l.code);
export const languageName = (code) => LANGUAGES.find((l) => l.code === code)?.name ?? code;

/** Primary language subtag of a BCP-47 tag ("es-MX", "es_MX", " ES " -> "es"), or '' when it isn't one. */
export function normalizeLang(tag) {
  const m = /^\s*([a-zA-Z]{2,3})(?:[-_]|\s*$)/.exec(String(tag ?? ''));
  return m ? m[1].toLowerCase() : '';
}

/** Whitelist a stored / submitted preference; anything unknown or corrupted becomes Auto. */
export function sanitizeLanguagePref(value) {
  return value === AUTO || SUPPORTED.includes(value) ? value : AUTO;
}

/**
 * Decide the summarizer languages.
 *  - pageLang: raw document language (may be empty / junk). Only used when supported.
 *  - pref: 'auto' or a supported code.
 * Returns:
 *  outputLanguage, expectedInputLanguages: the create()/availability() options
 *  pageSupported: false when the page declares a language we do not support (drives the gentle notice)
 *  detected: normalised page language ('' if none)
 */
export function resolveLanguage({ pref = AUTO, pageLang = '' } = {}) {
  const detected = normalizeLang(pageLang);
  const pageSupported = detected === '' || SUPPORTED.includes(detected); // no declaration -> assume English
  const input = SUPPORTED.includes(detected) ? detected : 'en';
  const choice = sanitizeLanguagePref(pref);
  const output = choice === AUTO ? input : choice;
  return { outputLanguage: output, expectedInputLanguages: [input], pageSupported, detected, auto: choice === AUTO };
}

/** Options for the intermediate chunk summaries of a long page: stay in the page's own language. */
export function chunkLanguage(resolved) {
  const l = resolved.expectedInputLanguages[0];
  return { outputLanguage: l, expectedInputLanguages: [l] };
}

/** The English fallback used when a language pair turns out to be unavailable in Auto mode. */
export const ENGLISH = { outputLanguage: 'en', expectedInputLanguages: ['en'] };

export const UNSUPPORTED_PAGE_NOTICE =
  "This page's language isn't supported for on-device summaries; summarizing may fail or be lower quality.";

/** Footnote under the panel, accurate for the current choice and (after a run) the language actually used. */
export function footnote({ pref = AUTO, resolved = null } = {}) {
  const choice = sanitizeLanguagePref(pref);
  if (choice !== AUTO) return `Summaries are in ${languageName(choice)}. Change in More options.`;
  if (resolved && resolved.outputLanguage !== 'en') return `Summaries are in ${languageName(resolved.outputLanguage)}, the page's language. Change in More options.`;
  return 'Summaries are in English by default; change in More options.';
}

/**
 * Wording of the download card. A language name is only mentioned when the OUTPUT language is the one being
 * fetched; a non-English page read into English output gets neutral wording. The base-model disk figure only
 * applies to the base model, so it is hidden whenever a language download is involved.
 */
export function downloadCopy(resolved) {
  const out = resolved.outputLanguage;
  const langInvolved = [out, ...resolved.expectedInputLanguages].some((l) => l !== 'en');
  if (!langInvolved) return { languagePack: false, title: null, intro: null, showDiskNote: true };
  const subject = out !== 'en' ? `Summarizing in ${languageName(out)}` : 'Summarizing this page';
  return {
    languagePack: true,
    title: 'One-time setup: download a language for on-device AI',
    intro: `${subject} needs a one-time download from Chrome: a language pack, or Chrome's on-device AI itself if it isn't set up yet. Chrome decides which. Best on Wi-Fi. After that it works offline, and the page you summarize never leaves your device.`,
    showDiskNote: false,
  };
}

/**
 * Language pair for the intermediate chunk summaries of a long page. The page's own language is preferred, but only
 * when that pair is already 'available' (it may otherwise need its own download, which cannot start outside a click).
 * Otherwise use the final (output, input) pair, which the run already checked.
 */
export function chunkLanguagePair(resolved, chunkAvailability) {
  return chunkAvailability === 'available'
    ? chunkLanguage(resolved)
    : { outputLanguage: resolved.outputLanguage, expectedInputLanguages: [...resolved.expectedInputLanguages] };
}
