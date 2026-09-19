import { extractPage } from './lib/extract.js';

globalThis.__tldrPanelExtract = () => extractPage(document);
