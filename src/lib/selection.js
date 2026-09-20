// "Summarize my selection": pure decisions, shared by the injected extractor and the panel.

/** Selections shorter than this (after whitespace clean-up) are ignored and the whole page is used. */
export const MIN_SELECTION_CHARS = 150;

export const MODE_AUTO = 'auto'; // use the selection when it is long enough, else the whole page
export const MODE_PAGE = 'page'; // the user asked for the whole page

/** Same whitespace normalisation the page extractor applies to its text. */
export function cleanSelection(s) {
  return String(s || '')
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The cleaned selection when it should be summarized instead of the page, else ''. */
export function pickSelection(raw, mode = MODE_AUTO) {
  if (mode === MODE_PAGE) return '';
  const text = cleanSelection(raw);
  return text.length >= MIN_SELECTION_CHARS ? text : '';
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
