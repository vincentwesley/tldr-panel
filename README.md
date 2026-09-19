# TL;DR Panel

**One click. Private summary of any page, right in your side panel.**

TL;DR Panel is a Chrome extension that summarizes the page you are reading using Chrome's
built-in, on-device Summarizer API (Gemini Nano). No backend, no account, no API key, no
telemetry. Page text never leaves your device.

## Use

1. Click the toolbar icon (or press Alt+Shift+S) on any web page.
2. The side panel opens and summarizes the page.
3. Pick a style (TL;DR, Key points, Teaser, Headline) and length (Short, Medium, Long).

First use may require a one-time download of Chrome's on-device model. The panel shows a
button and progress bar for that.

## Requirements

- Desktop Chrome 138 or newer (Windows, macOS, Linux, ChromeOS)
- About 22 GB of free disk space
- A GPU with more than 4 GB VRAM, or 16 GB RAM and 4+ CPU cores

## Permissions explained

| Permission | Why |
| --- | --- |
| `sidePanel` | Show the summary in Chrome's side panel. |
| `activeTab` | Read the text of the tab you clicked the icon on, only at that moment. No broad host access. |
| `scripting` | Inject the bundled text extractor into that tab. |
| `storage` | Remember your chosen style and length locally. |

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
```

Load `dist/` at `chrome://extensions` with Developer mode on. See [CONTRIBUTING.md](CONTRIBUTING.md)
and [DECISIONS.md](DECISIONS.md).

## License

MIT. Third-party notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
