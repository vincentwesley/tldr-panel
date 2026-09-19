// Build the unpacked extension into dist/ (or dist-e2e/ with --e2e).
// The e2e variant adds host_permissions for 127.0.0.1 ONLY so Playwright can exercise the real
// extraction path (activeTab is never granted in automation). It is never packaged or shipped.
import { build } from 'esbuild';
import { rm, mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const e2e = process.argv.includes('--e2e');
const out = path.join(root, e2e ? 'dist-e2e' : 'dist');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// __E2E__ gates the ?tabId= test hook in src/lib/page.js; esbuild removes the dead branch from production builds.
const common = { bundle: true, minify: false, minifySyntax: true, target: 'chrome138', legalComments: 'none', logLevel: 'warning', define: { __E2E__: String(e2e) } };
await build({ ...common, entryPoints: [path.join(root, 'src/sidepanel.js')], outfile: path.join(out, 'sidepanel.js'), format: 'esm' });
await build({ ...common, entryPoints: [path.join(root, 'src/background.js')], outfile: path.join(out, 'background.js'), format: 'esm' });
await build({ ...common, entryPoints: [path.join(root, 'src/extract-entry.js')], outfile: path.join(out, 'extract.js'), format: 'iife' });

await cp(path.join(root, 'src/sidepanel.html'), path.join(out, 'sidepanel.html'));
await cp(path.join(root, 'src/sidepanel.css'), path.join(out, 'sidepanel.css'));
await cp(path.join(root, 'src/icons'), path.join(out, 'icons'), { recursive: true });
await cp(path.join(root, 'LICENSE'), path.join(out, 'LICENSE'));
await cp(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(out, 'THIRD_PARTY_NOTICES.md'));
await cp(path.join(root, 'node_modules/@mozilla/readability/LICENSE.md'), path.join(out, 'LICENSE-readability.md'));
if (e2e) await writeFile(path.join(out, '.e2e-build'), 'test-only build; never package\n');

const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
manifest.version = pkg.version;

if (e2e) manifest.host_permissions = ['http://127.0.0.1/*'];
await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(`Built ${path.relative(root, out)}/ (version ${pkg.version}${e2e ? ', e2e variant' : ''})`);
