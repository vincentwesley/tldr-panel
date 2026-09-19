# Privacy Policy

TL;DR Panel summarizes web pages using the Summarizer API built into Chrome, which runs an
AI model on your own device.

- **No data leaves your device.** The text of the page you summarize is processed locally by
  Chrome's on-device model. TL;DR Panel has no server, no account, no API key, no analytics
  and no telemetry.
- **No remote code.** All code ships inside the extension package.
- **What is stored.** Only your chosen summary style and length, saved with
  `chrome.storage.local` on your device. Page text and summaries are never stored.
- **When it reads a page.** Only after you click the toolbar icon (or use the keyboard
  shortcut) on that tab, using Chrome's `activeTab` permission. It never reads tabs in the
  background.
- **Model download.** Chrome itself downloads the on-device model the first time. That
  download is performed by Chrome and is governed by Google's terms and privacy policy, not
  by this extension.

Questions: open an issue in the project repository.
