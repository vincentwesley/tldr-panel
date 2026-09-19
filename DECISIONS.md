# Decisions

Each decision, its rationale, and what could not be verified.

## Product and API

- **Summarizer runs in the side panel page.** The Summarizer API is unavailable in workers and
  service workers, so the top-level extension page hosts it. The service worker only calls
  `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`.
- **Global `Summarizer`, not `navigator.ai`.** `availability()` is checked first. A missing
  global is reported separately from `unavailable`.
- **`outputLanguage: 'en'` and `expectedInputLanguages: ['en']` always passed.** Chrome warns
  and may degrade output otherwise. `NotSupportedError` is shown as a language message.
- **Markdown output format for every type.** Rendered by a tiny DOM-node renderer
  (`src/lib/markdown.js`): paragraphs, `-`/`*` bullets, `**bold**`. No `innerHTML`, no links,
  no images, so model output and page text are inert.
- **Streaming chunk handling.** Chrome builds emit either deltas or cumulative text.
  `mergeChunk` treats a chunk that starts with the accumulated text as cumulative. Known
  ambiguity: a delta that repeats the whole accumulated prefix would be misread; considered
  negligible.
- **Download button.** `Summarizer.create()` needs transient user activation when the model
  is `downloadable`/`downloading`, so the button click handler calls `create()` before any
  `await`. Progress uses `e.loaded` as a 0-1 fraction.
- **Summarizer lifecycle.** A summarizer is created per run and destroyed in `finally`.
  Changing style/length re-summarizes with cached page text.

## Extraction

- **activeTab only, no host permissions.** The toolbar click grants activeTab; the panel then
  runs `chrome.scripting.executeScript`. Two calls: inject `extract.js` (an esbuild IIFE that
  bundles `@mozilla/readability` and sets `globalThis.__tldrPanelExtract`), then call it. Both
  run in the same isolated world so the global persists.
- **Readability first, body text fallback.** `isProbablyReaderable` then `Readability.parse()`
  on a cloned document (Readability mutates its input). If the result is under 200 chars, fall
  back to `body.innerText`. Text is capped at 500,000 characters.
- **Failure messages.** No grant (user switched tabs): "Click the TL;DR Panel toolbar icon on
  this tab to summarize it." chrome://, Web Store, extension pages, PDFs (by URL or content
  type) and empty pages each get their own message (`src/lib/page.js`). PDFs are not
  supported in 1.0.
- **Side panel does not follow tab switches.** It summarizes the tab active when it ran; the
  user clicks the icon again on another tab (which also renews the activeTab grant).

## Long pages

- `measureInputUsage` versus `inputQuota`. If too large: split on paragraph, then sentence,
  then word boundaries to about 70% of quota (proportional to measured usage), summarize each
  chunk with `key-points`, join, and repeat until it fits, then run the user's chosen
  type/length. Progress shows "Summarizing part N of M". `QuotaExceededError` re-splits using
  `err.quota`/`err.requested` (max depth 4). If the final pass throws a quota error the quota
  is lowered and the loop continues. The logic is pure and injected (`src/lib/pipeline.js`,
  `src/lib/chunking.js`).

## Build, icons, tooling

- **esbuild** bundles three entries: `sidepanel.js` (ESM), `background.js` (ESM), `extract.js`
  (IIFE). No frameworks. `dist/` is loadable unpacked.
- **Icons** are drawn by `scripts/icons.mjs` with a small pure-Node rasterizer and PNG encoder
  (no native dependencies): an indigo rounded square with a "TL;DR" pixel-font glyph at
  48/128 px and a "summary lines" glyph at 16 px (text is illegible that small). PNGs are
  committed.
- **Packaging** with `adm-zip` (cross-platform, manifest at zip root).
- **Manifest** sets `minimum_chrome_version: 138`.
- `package.json` is `"type": "module"`; ESLint flat config.

## Testing

- **Unit (Vitest + jsdom):** chunking, stream delta/cumulative, markdown renderer including
  XSS attempts, quota-retry logic, extraction (article, fallback, empty), page classification.
- **E2E (Playwright, bundled Chromium, new headless via `channel: 'chromium'`):** the
  unpacked extension is loaded; `sidepanel.html` is opened as a normal tab (extension id from
  the service worker URL); a fake `Summarizer` is injected with `addInitScript` for: missing
  API, unavailable, downloadable then progress then available (asserting user activation at
  `create()`), delta streaming success, quota-exceeded chunking, error, cancel, empty page.
- **Extraction in e2e uses a test-only build.** `activeTab` is never granted in automation,
  and the real panel also needs a target tab. The panel therefore accepts `?tabId=` (used only
  when present). `scripts/build.mjs --e2e` builds `dist-e2e/`, identical except for
  `host_permissions: ["http://127.0.0.1/*"]`, so the real `executeScript` extraction path runs
  against a local fixture. `dist-e2e/` is never packaged. The shipped `dist/` is tested for:
  manifest has no host permissions, and without a grant the panel shows the friendly
  "click the toolbar icon" message.
- **Screenshots** in `docs/screenshots/` are of the panel page at 420x760 in a normal tab
  (light and dark), produced by the e2e run with the fake Summarizer, so the summary text in
  them is canned.

## Not verified

- **The real on-device model (Gemini Nano) was not exercised.** All Summarizer behavior in
  tests is a fake modeled on the documented API. Real chunk semantics (delta vs cumulative),
  `measureInputUsage` values, quota sizes, download progress events, and output quality are
  unverified.
- **The true toolbar-click flow** (side panel opening, activeTab grant, Alt+Shift+S) cannot be
  driven by Playwright. Only the manifest wiring and `getPanelBehavior()` are asserted.
- **Side panel rendering inside Chrome's actual panel** (width, chrome around it) is
  approximated by a 420px tab.
- **Not tested on macOS/Linux, non-English pages, PDFs in the real Chrome PDF viewer, or
  Chrome Web Store pages.**
