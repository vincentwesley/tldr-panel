// "Summarize my selection": pure decisions, shared by the injected extractor and the panel.

/** Selections with fewer non-whitespace characters than this (after clean-up) are ignored and the whole page is used. */
export const MIN_SELECTION_CHARS = 150;

export const MODE_AUTO = 'auto'; // use the selection when it is long enough, else the whole page
export const MODE_PAGE = 'page'; // the user asked for the whole page

/** Same whitespace normalisation the page extractor applies to its text. */
export function cleanSelection(s) {
  return String(s || '')
    .replace(/[\u200b-\u200d\ufeff]/g, '') // zero-width characters count as nothing
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ') // collapse internal runs of spaces
    .trim();
}

/** The cleaned selection when it should be summarized instead of the page, else ''. */
export function pickSelection(raw, mode = MODE_AUTO) {
  if (mode === MODE_PAGE) return '';
  const text = cleanSelection(raw);
  return text.replace(/\s/g, '').length >= MIN_SELECTION_CHARS ? text : '';
}

/**
 * Which mode does the next run use?
 *  - explicit: the user pressed "Summarize whole page instead" -> that mode
 *  - fresh:    a new trigger (toolbar click / Summarize again) -> back to auto
 *  - tabChanged: the run reads a different tab than the previous one -> back to auto
 *  - otherwise (option changes): keep whatever the current run used
 */
export function decideMode({ explicit = null, fresh = false, tabChanged = false, current = MODE_AUTO } = {}) {
  if (explicit === MODE_PAGE || explicit === MODE_AUTO) return explicit;
  if (fresh || tabChanged) return MODE_AUTO;
  return current === MODE_PAGE ? MODE_PAGE : MODE_AUTO;
}

/** Note shown when the text handed to the model was cut at the size cap. */
export function truncationNote(kind) {
  return kind === 'selection'
    ? 'Your selection is very long; only the first part was summarized.'
    : 'This page is very long; only the first part was summarized.';
}
