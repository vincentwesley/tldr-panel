import { extractPage } from './lib/extract.js';

globalThis.__tldrPanelExtract = (mode) => extractPage(document, { mode });
