# Chrome Web Store listing: TL;DR Panel

Everything below is ready to paste into the Chrome Web Store developer dashboard.

## Store listing tab

**Name:** TL;DR Panel

**Summary (max 132 chars):**
Summarize the page you're reading in one click, privately, using Chrome's built-in on-device AI. Needs desktop Chrome 138+.

**Category:** Productivity

**Language:** English

**Detailed description:**

Too long, didn't read? Click the TL;DR Panel icon (or press Alt+Shift+S) and get a summary of the page you are reading in Chrome's side panel, right next to the page.

- One click, no setup: no account, no API key, no sign-in.
- Private by design: summaries are generated on your own device by Gemini Nano through Chrome's built-in Summarizer API. The page text never leaves your computer. There is no backend and no telemetry.
- Pick the format you want: Summary, Key points, or Headline, and a detail level (Brief, Standard, Detailed).
- Summarize just part of a page: select some text (at least 150 characters) and click the icon.
- Summaries in English, Spanish, Japanese, French or German: Auto follows the page's language, or choose one under More options.
- Stays out of your way: the side panel sits beside the page, and clicking the icon on another tab summarizes that tab.
- Copy the result with one click.

Requirements and honest limits:
- Desktop Chrome 138 or newer (Windows 10/11, macOS 13+, Linux, Chromebook Plus).
- Supported hardware: about 22 GB of free disk space, and a GPU with more than 4 GB VRAM or 16 GB RAM with 4+ CPU cores.
- The first use downloads Chrome's on-device model once (it took about 7 minutes in our testing). If your hardware is unsupported, the panel says so instead of failing silently.
- Summary languages: English, Spanish, Japanese, French, German (other languages are not supported by Chrome's on-device model yet). The panel's own buttons and messages are English. Summaries are AI output and can be wrong.
- Works on regular web pages. It cannot read Chrome's own pages (New Tab, Settings, Web Store), PDFs, or local files unless you enable file URL access.

Open source (MIT): https://github.com/vincentwesley/tldr-panel

## Privacy practices tab

**Single purpose:** Summarize the web page the user is currently reading and show the summary in Chrome's side panel.

**Permission justifications**

- `sidePanel`: Used to display the summary UI in Chrome's side panel next to the page, which is the extension's only user interface.
- `activeTab`: Used to read the text of the tab the user clicked the toolbar icon (or pressed the shortcut) on, only at that moment, so it can be summarized. It avoids any broad host permissions; the extension declares no host_permissions.
- `scripting`: Used with `chrome.scripting.executeScript` to inject the extension's own bundled text extractor (extract.js) into the active tab and return the page's readable text to the side panel. No remote or dynamically fetched code is injected.
- `storage`: Used with `chrome.storage.local` to remember the user's chosen summary style, detail level and language on their device. Page text and summaries are not stored.

**Remote code:** No, I am not using remote code. All JavaScript ships inside the extension package; the CSP is `script-src 'self'` with `connect-src 'none'`.

**Data usage**
- Does the extension collect or use user data? No user data is collected. Page text is processed on-device by Chrome's built-in model and is not stored or transmitted by the extension.
- Leave all data-type checkboxes (personally identifiable info, health, financial, authentication, personal communications, location, web history, user activity, website content) UNCHECKED. Website content is read locally only and never collected or transferred off the device.
- Certifications (check all three): I do not sell or transfer user data to third parties outside of the approved use cases; I do not use or transfer user data for purposes unrelated to the item's single purpose; I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://github.com/vincentwesley/tldr-panel/blob/main/PRIVACY.md

## Graphics

Screenshots (1280x800 PNG, in this repo):
1. docs/screenshots/result-light.png (summary result, light theme)
2. docs/screenshots/result-dark.png (summary result, dark theme)
3. docs/screenshots/download.png (one-time on-device model download card)
4. docs/screenshots/unavailable.png (clear message on unsupported hardware or pages)

Store icon: 128x128, src/icons/icon128.png (also in the package).

Small promo tile (440x280): NOT yet created. Optional but recommended; needs to be made before or shortly after submission. Marquee (1400x560) is optional and not created.

## Links

- Homepage: https://github.com/vincentwesley/tldr-panel
- Support: https://github.com/vincentwesley/tldr-panel/issues

## Test instructions for reviewers

No account or credentials are needed.
1. Use desktop Chrome 138+ on supported hardware (about 22 GB free disk; GPU with >4 GB VRAM, or 16 GB RAM and 4+ cores).
2. Install the extension, open any regular article page (for example a Wikipedia article), and click the TL;DR Panel toolbar icon (pin it from the puzzle-piece menu if needed) or press Alt+Shift+S.
3. The side panel opens. On first use Chrome's on-device model (Gemini Nano) must be downloaded; the panel shows a download button and progress bar. This can take several minutes and requires network access for Chrome's own download. Once downloaded, the summary streams into the panel.
4. If the reviewer's machine does not meet the hardware requirements, the Summarizer API reports unavailable and the panel shows an explanatory "unavailable" message; this is expected behavior, not a defect. See docs/screenshots/unavailable.png and result-light.png for expected screens.
5. Try Key points / Headline and the detail level and language under "More options". To try selection, select a paragraph of at least 150 characters before clicking the icon; the panel says "Summarizing your selection". Chrome-internal pages, the Web Store, and PDFs are intentionally unsupported and show a message.
