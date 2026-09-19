# Decisions

Each decision, its rationale, and what could not be verified.

## Product and API

- **Summarizer runs in the side panel page.** The Summarizer API is unavailable in workers and
  service workers, so the top-level extension page hosts it. The service worker only opens the panel
  and notifies it (see "Opening the panel and activeTab").
- **Global `Summarizer`, not `navigator.ai`.** `availability()` is checked first. A missing global is
  reported separately from `unavailable`.
- **`outputLanguage: 'en'` and `expectedInputLanguages: ['en']` always passed.** Chrome warns and may
  degrade output otherwise. The UI says "Summaries are in English."
- **Markdown output format for every type**, rendered by a DOM-node renderer (`src/lib/markdown.js`):
  paragraphs, `-`/`*` bullets, numbered lists, `#` headings (shown as bold paragraphs), wrapped list
  items, `**bold**`. No `innerHTML`, no links, no images, so model output and page text are inert.
  Copy puts plain text on the clipboard (`toPlainText`).
- **Streaming chunks are deltas (verified in Chrome 153).** `mergeChunk` defaults to delta and only
  concludes "cumulative" when a later chunk is longer than and starts with an already substantial
  accumulated text (>= 8 chars); the decision is sticky. Known limitation: a cumulative stream whose
  first chunk is shorter than 8 characters would be misread as deltas (not observed in practice).
- **Download button.** `Summarizer.create()` needs transient user activation when the model is
  `downloadable`/`downloading`, so the click handler calls `create()` before any `await`. The card copy
  deliberately states no model size (unverified); "about 7 minutes on a fast connection" and "about 22 GB
  of free disk space" are from our test and Chrome's documented requirement.
- **Cancelling the download** aborts `create()` via its signal and returns to the neutral download card.
  Whether Chrome keeps downloading in the background after an abort was not verified.
- **Summarizer lifecycle.** A summarizer is created per run and destroyed in `finally`.

## Opening the panel and activeTab (the core bug)

- **Verified in real Chrome 153:** `sidePanel.setPanelBehavior({openPanelOnActionClick: true})` opens the
  panel on a toolbar click but does NOT grant `activeTab`, so extraction failed. A control build using
  `action.onClicked` -> `sidePanel.open({tabId})` did get the grant and worked end to end with the real
  model. The earlier claim in this file that "a click is enough" was wrong for `openPanelOnActionClick`.
- `background.js` now calls `sidePanel.setPanelBehavior({openPanelOnActionClick:false})` (the setting
  persists in the browser, so an older install must not swallow `onClicked`) and registers
  `action.onClicked`. The listener calls `sidePanel.open({tabId})` synchronously (no `await` before it,
  or the user gesture is lost), then `runtime.sendMessage({type:'tldr:activated', tabId})`, ignoring "no
  receiver" errors. `_execute_action` (Alt+Shift+S) fires the same `onClicked`.
- The panel resolves the active tab in its window on load and auto-summarizes. It also listens for
  `tldr:activated`, accepted only when `sender.id === chrome.runtime.id`, type matches and `tabId` is an
  integer; it then starts a fresh run (aborting any in-flight one) for that tab. If a run for the same tab
  is already in flight (the first click opens the panel and also sends the message) the message is skipped.
- **Stale panel.** `tabs.onActivated` / `tabs.onUpdated` (status only; readable without permissions) mark
  the panel stale: a slim banner says to click the icon, the old page title is hidden, and control changes
  re-extract instead of re-using the old page. There is no button in the banner because a panel click does
  not grant access.
- Wiring is in `src/lib/background-wiring.js` and `src/lib/activation.js` so it is unit tested with a stub.

## Extraction

- **activeTab only, no host permissions.** Two `executeScript` calls: inject `extract.js` (an esbuild
  IIFE bundling `@mozilla/readability`), then call it. Both run in the same isolated world.
- **Readability first, body text fallback**, on a cloned document. Text is rebuilt from Readability's
  HTML so blank-line paragraph breaks (and single newlines between list items) survive, which lets the
  chunker split on paragraphs. Under 200 chars falls back to `body.innerText`. Text is capped at 120,000
  characters (`MAX_CHARS` in `src/lib/extract.js`) and `truncated` is surfaced as a note. Pages with more than 2,000,000 characters of raw text
  skip Readability (cloning and parsing that DOM is slow) and use sliced body text.
- **Errors** (`src/lib/page.js`): `executeScript` failures are read from rejections and from
  `result[].error`. Internal pages, PDFs (only by URL or content type), empty pages, `file:` URLs and
  missing grants get their own neutral messages; anything else shows "Something unexpected happened. Try
  again, or reload the page." and the raw error goes to the console only. Unrelated errors cannot match
  the no-grant regex.
- **`?tabId=` test hook** exists only when built with `--e2e` (`__E2E__` define; esbuild drops the branch,
  and `scripts/package.mjs` fails if it is found in `dist/`).

## Long pages

- Real model facts (measured): `inputQuota` 9216; `'hello world'` = 511 tokens; 2100 chars = 874;
  10500 chars = 2330. There is a fixed ~500-token overhead per request, so tokens are not proportional to
  characters. The pipeline measures the overhead once and sizes chunks from marginal tokens per character
  toward 70% of the quota.
- Guards: quota must be finite and > 0; chunks below 100 chars, more than 60 chunks in one pass, or more
  than 150 chunk calls in a run fail with `TooLongError` ("This page is too long to summarize on-device")
  before hammering the model. `QuotaExceededError` retries clamp the split ratio to [0.1, 0.5].

- **Very long pages are truncated at 120,000 characters** (was 500,000). Real on-device measurements:
  about 65 s per chunk (60-170 s seen), so 100k chars = 4 chunks = about 4.7 min; a 250k-char page ran
  over 800 s without finishing. Chunked summaries of long pages can take a few minutes; the progress text
  says so ("Part 2 of 4 - long pages can take a few minutes").
- **Stale panel targets the active tab.** When the panel is stale, style/detail changes and "Summarize
  again" read the ACTIVE tab (`chooseTab` in `src/lib/page.js`), never the old page. Without an activeTab
  grant it shows the no-grant message and keeps the banner. The banner clears only after a fresh read.
- **Service worker** calls `sidePanel.setPanelBehavior({openPanelOnActionClick:false})` at top level on every
  start (the setting persists in the browser profile), with errors caught.
- **Known gap: about:blank and similar.** Without a grant `tab.url` is hidden, so "no grant" and "URL
  unreadable" look the same; both show the no-grant message. Not cleanly distinguishable, left as is.

## Build, icons, tooling

- **esbuild** bundles `sidepanel.js` (ESM), `background.js` (ESM), `extract.js` (IIFE), with
  `minifySyntax` so dead branches are removed.
- **Icons** are drawn by `scripts/icons.mjs` (pure Node rasterizer): one bold "TL" motif at every size
  (with ";" from 48px up), panel accent blue `#1d4ed8`, and a lighter inner stroke for dark toolbars.
  Viewed at 16/48/128 (normal and enlarged) on white, dark and grey backgrounds.
- **Packaging** (`scripts/package.mjs`) refuses to zip if the dist manifest has host permissions, no CSP,
  a description over 132 chars, e2e artifacts, or is missing the licence files; it checks the zip root.
- **CSP:** `script-src 'self'; object-src 'self'; base-uri 'none'; form-action 'none'; connect-src 'none'`.
  `connect-src 'none'` was verified with the real Summarizer (create, streaming, model measure) in Chrome
  153 and with the e2e fake; nothing in the extension makes network requests.
- **Licences:** `LICENSE-readability.md` ships in the package and the full Apache-2.0 text is in
  `THIRD_PARTY_NOTICES.md`.

## UX notes

- Styles: Summary (`tldr`) / Key points / Headline. Teaser was dropped; stored `teaser` migrates to
  Summary. Stored values are whitelisted. Detail (Brief/Standard/Detailed = short/medium/long) is inside
  "More options" and hidden for Headline. Control changes re-run after a 400 ms debounce.
- Page-cannot-be-read states are neutral (no red); red is reserved for real failures.
- Accessibility: `aria-live` removed from the streaming result; one visually hidden status line
  announces "Summary ready", "Stopped", copy result and 25/50/75/100% download progress. Errors unhide
  first then focus the heading; buttons that can hold focus use `aria-disabled`; focus moves to the result
  on completion only if it would otherwise be lost. Forced-colors, RTL (logical properties, `dir=auto`),
  320px and reduced-motion handled in CSS.

## Verification (what was actually run, and what was not)

- **Unit (Vitest + jsdom)** and **e2e (Playwright, bundled Chromium, fake Summarizer)**. The e2e suite
  loads `dist-e2e` (same code plus `host_permissions` for 127.0.0.1 so the real `executeScript`
  extraction runs) and the shipped `dist` (manifest, no-grant notice, hook absent). The service worker ->
  panel `tldr:activated` message is exercised for real; the sender check is unit tested only, because a
  second sender cannot be simulated in Playwright.
- **Real Chrome 153 + real model (Puppeteer, this round):** the panel from `dist-e2e` (identical code to
  `dist`, reached via `?tabId=`) extracted the fixture article and produced real streamed summaries in
  light and dark with the final CSP. (The store result screenshots were later regenerated with the fake text after the UI redesign; see Screenshots.)
- **NOT verified this round (honest gaps):**
  - The shipped `dist/` with a real toolbar click producing an activeTab grant, and a click on a second
    tab re-summarizing while the panel is open. An OS-level attempt (SendKeys Alt+Shift+S) opened the
    panel in the first run but the panel reported no grant; the cause is unknown (input delivery/focus in
    an automated window vs. a real limitation). Later attempts were aborted because the automation window
    was not in front and synthetic input was landing in another browser window on the shared desktop, so
    OS-level input automation was stopped. Someone must verify manually: load `dist/`, open an article,
    click the toolbar icon (and try Alt+Shift+S), then switch tabs and click again.
  - Real clipboard copy (e2e stubs `navigator.clipboard`), real background download continuation after
    cancel, macOS/Linux, non-English pages, PDFs in the real viewer, Web Store pages.
- **Screenshots** (`node scripts/screenshots.mjs`, needs `build --e2e`): 1280x800 with the fixture article
  and the panel at 420px. Result screenshots use the e2e fake's text since the 1.0.1 UI redesign (the earlier real-model captures show the old layout and are kept only as gitignored `raw/old-ui-real-result-*`); the download and unavailable states come from the e2e fake (they cannot be produced on this machine, as
  the model is installed). Only the fixture page and the panel are captured, no browser chrome.

## UI polish pass (1.0.1)

Critique of 1.0.0 as rendered (16 states x 320/420/600 x light/dark, `node scripts/ui-states.mjs`):
- Result was pushed about 190px down by title, Style label, control, "More options" and a footnote; controls
  outweighed the summary. Below 360px the segmented control stacked into three full-width rows.
- Selected segment was a solid accent fill (loudest thing on screen); two same-weight bordered buttons
  ("Summarize again", "Copy") competed; copy feedback only changed a label.
- Loading was a tiny spinner with a link-styled Cancel; cards had no visual anchor, error text was red on red
  tint; spacing (14/10/8/6) and sizes (12/12.5/13/14/15) were ad hoc; header was a bare bold title.

What changed and why:
- Design tokens (spacing 4/8/12/16/24, type 12/13/14/15, radii 6/8/12, one accent, no shadows), 16px gutters.
- Sticky top bar: logo, name, icon-only refresh (aria-label "Summarize again"), page title as subtitle. The
  refresh action left the bottom row, which now holds only a ghost icon+label Copy that shows "Copied" with a check.
- Style legend hidden visually (still the group name); Detail is one quiet line "Detail: Standard" that
  expands to the Detail control (label kept in sync by JS). Selected segment: outlined accent, not filled.
- Result is the hero: 15px/1.6, 68ch max, 12px paragraph gap. Truncated/stopped notes sit under the text.
- Loading: muted status line + Cancel, plus shimmer skeleton lines (static under reduced motion) until text streams.
- State cards: inline SVG glyph beside the title, one primary action, body text in normal colour (error keeps a
  danger glyph/title/border). Stale banner is a slim inline notice; footnote is a low-key footer.
- Kept: all ids used by tests, radio names/values, status line, focus management, forced-colors, dir=auto and
  logical properties, no innerHTML, 32px targets, CSP. Copy shortened only in the download card.

Deliberately not changed: no menu or settings page (nothing to put in it), no card around the summary (adds
chrome), style/detail stay above the result (they act on it), no web fonts or icon fonts, no animation beyond the
skeleton, no summary text shortening beyond one sentence in the download card, download flow/behaviour untouched.

Contrast (WCAG 2.x, computed from the tokens; text needs 4.5, UI boundaries 3):
| Pair | Light | Dark |
|---|---|---|
| text / bg | 16.56 | 14.76 |
| text / surface | 15.16 | 12.95 |
| muted / bg | 6.40 | 7.75 |
| muted / surface | 5.86 | 6.80 |
| accent / bg (selected label, Cancel) | 6.70 | 8.44 |
| accent / surface | 6.14 | 7.41 |
| on-accent / accent (primary button) | 6.70 | 8.88 |
| border-ui / bg (control outline) | 3.84 | 4.31 |
| border-ui / surface | 3.52 | 3.78 |
| danger / danger-bg (glyph, title) | 5.95 | 7.30 |
| banner text / banner bg | 10.23 | 10.26 |
The ghost Copy and refresh buttons have no outline; their icon and label are muted (5.86+) and gain a surface
fill on hover. The skeleton (1.24) is decorative and aria-hidden.

Verified with Playwright (headless Chromium) at 320/420/600, light/dark, RTL (dir=rtl) and forced-colors
emulation; no horizontal overflow at 320. Not verified: a real side panel in Chrome, real screen readers.
