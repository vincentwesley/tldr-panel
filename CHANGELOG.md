# Changelog

## 1.1.0: selection and language

- Summarize just your selection: select at least 150 characters and click the icon; "Summarize whole page instead" returns to the full page. Top frame only.
- Output language picker under More options (Auto, English, Spanish, Japanese, French, German). Auto follows the page's declared language when supported, else English. The list was set from a real Chrome 153 availability check (pt, it, ko, zh, hi, ar, ru reported unavailable).
- The footnote and download wording adapt to the chosen language. Panel UI text stays English.
- A selection counts only when it has at least 150 non-whitespace characters; zero-width characters are ignored. A truncated selection says "Your selection is very long" rather than "This page".
- The language download card no longer names a language unless it is the output language, and no longer shows the base-model disk-space line for language downloads.
- Long pages: chunk summaries use the page-language pair only when it is already available, otherwise the final language pair.
- Focus stays in the panel after "Summarize whole page instead"; the footnote no longer shows a previous run's language after a failure.
- No new permissions; manifest and CSP unchanged.

## 1.0.1: UI polish

- Cleaner, calmer side panel: design tokens, sticky top bar with refresh, page title subtitle, quieter Style/Detail controls, larger reading text, ghost Copy with "Copied" feedback, skeleton loading, glyphs on state cards, slim stale notice, low-key footer.
- The refresh button is now clearly visible (full-contrast icon, 32px target, hover/focus fill, "Summarize again" tooltip) and Copy is more prominent.
- Fixed a low-severity race: switching tabs while a run was reading the page no longer clears the "You switched pages" banner.
- A blank or otherwise unreadable tab right after a toolbar click now shows the neutral "Chrome doesn't let extensions read this kind of page" message.
- Store screenshots regenerated with the new UI (result images use real on-device model output).
- No permission changes.

## Unreleased (post-review fixes)

- **Fixed the core bug:** `openPanelOnActionClick` opens the panel but does not grant `activeTab`, so
  extraction failed. The service worker now handles `action.onClicked` and calls
  `sidePanel.open({tabId})` synchronously, then notifies an open panel (`tldr:activated`) so a click on
  another tab re-summarizes that tab. The message is accepted only from this extension.
- Streaming: sticky, conservative delta/cumulative detection (real Chrome streams deltas).
- Long pages: quota validation, minimum chunk size, call budget with a clear "too long" error, request
  overhead (~500 tokens) accounted for, clamped retry ratio, whitespace-aware hard splits.
- Extraction keeps paragraph breaks; huge pages are not parsed; a "very long page" note is shown.
- Stale-run and stale-page fixes; cancel keeps partial text with a note; empty output and download
  cancel handled.
- Friendly, neutral messages for pages that cannot be read; no raw internal error strings.
- UI: Summary / Key points / Headline, Detail under More options, debounce, stale-tab banner,
  accessibility (single status line, focus management, forced-colors, RTL, 320px), plain-text copy.
- New icons sharing one bold "TL;" motif; new store-size screenshots.
- Explicit extension-page CSP; Readability licence shipped in the package; stricter packaging checks;
  the `?tabId=` test hook is compiled out of the production build.
- Style "Teaser" removed (stored value migrates to Summary).

## 1.0.0

- Initial release.
- One-click side panel that summarizes the current page with Chrome's on-device Summarizer API.
- Styles: TL;DR, key points, teaser, headline. Lengths: short, medium, long.
- Readability-based text extraction; chunked summarization for long pages.
- On-device model download flow with progress; clear messages for unsupported devices and pages.
- Light and dark themes; keyboard shortcut Alt+Shift+S.
