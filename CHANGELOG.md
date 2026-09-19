# Changelog

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
