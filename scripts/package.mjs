// Zip dist/ into release/tldr-panel-v<version>.zip with manifest.json at the zip root.
import AdmZip from 'adm-zip';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await mkdir(path.join(root, 'release'), { recursive: true });
const zip = new AdmZip();
zip.addLocalFolder(path.join(root, 'dist'));
const file = path.join(root, 'release', `tldr-panel-v${pkg.version}.zip`);
zip.writeZip(file);
console.log(`Wrote ${path.relative(root, file)} (${zip.getEntries().length} entries)`);
