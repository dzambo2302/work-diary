/**
 * Zips dist/ into an installable extension archive.
 *
 *   node scripts/package.mjs
 *   PACKAGE_VERSION=0.1.42 node scripts/package.mjs
 *
 * When PACKAGE_VERSION is set, dist/manifest.json is rewritten to that version
 * before zipping, so the archive and the GitHub Release always agree. Chrome
 * only accepts 1-4 dot-separated integers, so the version is validated here
 * rather than failing later at install time.
 *
 * setup.ps1 is copied alongside the archive: downloaded into the same folder it
 * finds the zip on its own, so installing is one command rather than a hunt
 * through the extensions page.
 */
import { ZipArchive } from 'archiver';
import {
  copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';

const at = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

const DIST = at('dist');
const OUT_DIR = at('artifacts');
const MANIFEST = `${DIST}/manifest.json`;

if (!existsSync(MANIFEST)) {
  console.error('dist/manifest.json is missing — run `npm run build` first.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const version = process.env.PACKAGE_VERSION?.trim() || manifest.version;

if (!/^\d{1,5}(\.\d{1,5}){0,3}$/.test(version)) {
  console.error(
    `Invalid extension version "${version}". Chrome requires 1-4 dot-separated integers.`,
  );
  process.exit(1);
}

if (version !== manifest.version) {
  manifest.version = version;
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

mkdirSync(OUT_DIR, { recursive: true });
copyFileSync(at('scripts/setup.ps1'), `${OUT_DIR}/setup.ps1`);
const outPath = `${OUT_DIR}/work-diary-${version}.zip`;

const output = createWriteStream(outPath);
const archive = new ZipArchive({ zlib: { level: 9 } });

output.on('close', () => {
  const kb = (archive.pointer() / 1024).toFixed(1);
  console.log(`${outPath}  (${kb} kB, version ${version})`);
  // Consumed by the release workflow.
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(
      process.env.GITHUB_OUTPUT,
      `zip=${outPath}\nversion=${version}\n`,
      { flag: 'a' },
    );
  }
});

archive.on('warning', (err) => { throw err; });
archive.on('error', (err) => { throw err; });

archive.pipe(output);
// Zip the *contents* of dist/, so manifest.json sits at the archive root —
// Chrome rejects an archive with a single wrapping folder.
archive.directory(DIST, false);
await archive.finalize();
