// Output-language logic. Pure: no Chrome APIs. UI chrome text stays English; only the summary language varies.

/**
 * Output languages offered in the picker. EDIT THIS LIST ONLY: conservative default = the languages Chrome documents
 * for the Summarizer (en, es, ja); to be re-verified empirically in real Chrome and adjusted.
 * name = what the picker shows (native name first so speakers can find it).
 */
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Espa\u00f1ol (Spanish)' },
  { code: 'ja', name: '\u65e5\u672c\u8a9e (Japanese)' },
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
