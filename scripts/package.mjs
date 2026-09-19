// Zip dist/ into release/tldr-panel-v<version>.zip with manifest.json at the zip root.
// Refuses to package a dist/ that is not the clean production build.
import AdmZip from 'adm-zip';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

function fail(msg) {
  console.error(`package: REFUSING TO PACKAGE: ${msg}`);
  process.exit(1);
}

const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));
if (manifest.host_permissions !== undefined) fail('manifest has host_permissions');
if (manifest.optional_host_permissions !== undefined) fail('manifest has optional_host_permissions');
if ((manifest.permissions || []).some((p) => p === '<all_urls>' || /:\/\//.test(p))) fail('manifest has host-like permissions');
if (manifest.description.length > 132) fail(`description is ${manifest.description.length} chars (max 132)`);
if (!manifest.content_security_policy?.extension_pages) fail('manifest has no explicit CSP');

const files = (await readdir(dist, { recursive: true })).map((f) => f.replaceAll('\\', '/'));
if (files.includes('.e2e-build')) fail('dist/ contains the e2e build marker (built with --e2e?)');
for (const need of ['manifest.json', 'LICENSE', 'LICENSE-readability.md', 'THIRD_PARTY_NOTICES.md', 'sidepanel.js', 'background.js', 'extract.js']) {
  if (!files.includes(need)) fail(`dist/ is missing ${need}`);
}
for (const f of files.filter((f) => /\.(js|html)$/.test(f))) {
  const src = await readFile(path.join(dist, f), 'utf8');
  if (/127\.0\.0\.1|__E2E__|get\(['"]tabId['"]\)/.test(src)) fail(`${f} contains e2e-only code`);
}

await mkdir(path.join(root, 'release'), { recursive: true });
const zip = new AdmZip();
zip.addLocalFolder(dist);
const file = path.join(root, 'release', `tldr-panel-v${pkg.version}.zip`);
zip.writeZip(file);
const names = new AdmZip(file).getEntries().map((e) => e.entryName);
if (!names.includes('manifest.json')) fail('zip root has no manifest.json');
if (!names.includes('LICENSE-readability.md')) fail('zip has no LICENSE-readability.md');
console.log(`Wrote ${path.relative(root, file)} (${names.length} entries; checks passed)`);
