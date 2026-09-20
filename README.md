# TL;DR Panel

**Summarize the page you're reading in one click, privately, using Chrome's built-in on-device AI.**
Needs desktop Chrome 138+. Summarizes the whole page or just the text you select, in English, Spanish, Japanese, French or German.

TL;DR Panel is a Chrome extension that summarizes the web page you are reading using Chrome's
built-in, on-device Summarizer API (Gemini Nano). No backend, no account, no API key, no
telemetry. Page text never leaves your device.

![Result](docs/screenshots/result-light.png)

## Use

1. Open an article or website and click the TL;DR Panel toolbar icon (or press Alt+Shift+S). If you
   don't see the icon, look under Chrome's puzzle-piece menu and pin it.
2. The side panel opens and summarizes that page. With the panel open, click the icon on another
   tab to summarize that tab.
3. Pick a style (Summary, Key points, Headline). Under "More options" choose the detail level
   (Brief, Standard, Detailed) and the summary language.

## Features

- **Summarize a selection.** Select some text on the page (at least 150 characters), then click the
  icon. The panel says "Summarizing your selection" and summarizes only that text. "Summarize whole
  page instead" switches to the full page. A shorter selection is ignored and the whole page is used.
  Only the selection in the page's top frame is read; text selected inside an iframe is not.
- **Summary language.** Under "More options", Language is Auto by default: it follows the page's
  declared language (`<html lang>`) when that language is supported, otherwise English. Or pick a
  language yourself; that sets the language of the summary, e.g. Spanish for an English page. Your
  choice is remembered. The panel's own buttons and messages stay in English.
  If Chrome needs a language download for the pair, the panel shows the usual one-time download card.
- **Supported languages** (checked in real Chrome 153 with Gemini Nano, 2026-09-20; Chrome may add
  more later):

| Language | Output | Notes |
| --- | --- | --- |
| English (en) | yes | default |
| Spanish (es) | yes | |
| Japanese (ja) | yes | |
| French (fr) | yes | reported available and produced a French summary in our test |
| German (de) | yes | reported available and produced a German summary in our test |
| Portuguese, Italian, Korean, Chinese, Hindi, Arabic, Russian | no | Chrome reported these unavailable |

  On a page in an unsupported language (for example Russian), Auto summarizes in English. Quality in
  non-English languages is uneven and it is AI output; check anything important.

First use needs a one-time download of Chrome's on-device model (in our test about 7 minutes on
a fast connection; best on Wi-Fi). The panel shows a card with a button and progress bar.

Limits: it reads regular web pages only. It cannot read Chrome's own pages (New Tab, Settings, the
Web Store), PDFs, or local files unless you turn on "Allow access to file URLs" for the extension.
Summaries are AI output, so they can be wrong.

## Requirements

- Desktop Chrome 138 or newer on Windows 10/11, macOS 13+, Linux, or Chromebook Plus
- At least 22 GB of free disk space
- A GPU with more than 4 GB VRAM, or 16 GB RAM and 4+ CPU cores

## Known limitations

- Needs supported hardware and about 22 GB of free disk space (see Requirements).
- The first-time model download took about 7 minutes in testing.
- Output languages are limited to en, es, ja, fr, de; the panel's own text is English only.
- Selection: top frame only; the selection is read at the moment you click the icon.
- PDFs, `chrome://` pages and the Chrome Web Store are unsupported.
- Very long pages are truncated at 120,000 characters, and chunked summaries of long pages are slow:
  about 65 s per chunk on-device (100k characters = 4 chunks, roughly 4.7 minutes).
- The Alt+Shift+S shortcut is registered but not covered by automated tests.
- The real clipboard write can only be tested manually.
- Tested on Windows with Chrome 153 only.

## Permissions explained

| Permission | Why |
| --- | --- |
| `sidePanel` | Show the summary in Chrome's side panel. |
| `activeTab` | Read the text of the tab you clicked the icon on, only at that moment. No broad host access. |
| `scripting` | Inject the bundled text extractor into that tab. |
| `storage` | Remember your chosen style, detail level and language locally. |

There are no host permissions. See [PRIVACY.md](PRIVACY.md).

## Develop

```
npm ci
npm run build       # dist/
npm test            # unit tests
npm run test:e2e    # Playwright
npm run lint
npm run package     # release/tldr-panel-v<version>.zip
npm run icons       # regenerate src/icons/*.png
node scripts/screenshots.mjs   # regenerate docs/screenshots (after build --e2e)
```

Load `dist/` at `chrome://extensions` with Developer mode on. See [CONTRIBUTING.md](CONTRIBUTING.md)
and [DECISIONS.md](DECISIONS.md). Report bugs at
<https://github.com/vincentwesley/tldr-panel/issues>. Source: <https://github.com/vincentwesley/tldr-panel>.

## License

MIT. Third-party notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
