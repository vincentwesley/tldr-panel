# Contributing

## Setup

```
npm ci
npm run build        # outputs dist/, load it via chrome://extensions > Load unpacked
npm test             # unit tests (Vitest)
npx playwright install chromium
npm run test:e2e     # end-to-end tests with a fake Summarizer
npm run lint
```

Requires Node 20+. No frameworks: the panel is vanilla ES modules bundled with esbuild.

## Guidelines

- Keep it small. No runtime dependencies beyond `@mozilla/readability`.
- No network calls, no analytics, no remote code. Privacy is the product.
- Never use `innerHTML` for model or page output; see `src/lib/markdown.js`.
- Add or update unit tests for logic in `src/lib/`, and e2e tests for UI states.
- Request no new permissions without a strong reason, and document any in the README.
