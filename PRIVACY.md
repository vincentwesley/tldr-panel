# Privacy Policy

TL;DR Panel summarizes web pages using the Summarizer API built into Chrome, which runs an
AI model on your own device.

- **No data leaves your device.** The text of the page you summarize is processed locally by
  Chrome's on-device model. TL;DR Panel has no server, no account, no API key, no analytics
  and no telemetry.
- **No remote code.** All code ships inside the extension package.
- **What is stored.** Only your chosen summary style and length, saved with
  `chrome.storage.local` on your device. Page text and summaries are never stored.
- **When it reads a page.** Page text is read only when you click the toolbar icon or use the
  shortcut, or press "Summarize again" while access to that tab remains granted by Chrome's
  `activeTab` permission. It never reads tabs in the background.
- **AI output.** Summaries are written by an AI model and may be inaccurate. They can also be
  influenced by the content of the page being summarized (for example text on the page that
  addresses the model). Treat them as a convenience, not as a source of truth.
- **Model download.** Chrome itself downloads the on-device model the first time. That
  download is performed by Chrome and is governed by Google's terms and privacy policy, not
  by this extension.

Questions: open an issue in the project repository.
