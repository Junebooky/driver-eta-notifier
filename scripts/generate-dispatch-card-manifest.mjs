/**
 * Build-time inventory of complete dispatch-card image triplets.
 * Add three .webp files under public/images/dispatch_cards/vehicles/<model>/
 * or <model>/<plateShort>/ and the next dev/build/test run refreshes the manifest.
 * Never scan the filesystem from a browser component.
 */
import { existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const base = join(process.cwd(), 'public/images/dispatch_cards/vehicles');
const output = join(process.cwd(), 'lib/dispatchCards/dispatchCardAssetManifest.json');
const prefix = '/images/dispatch_cards/vehicles';
const manifest = {};

function scan(folder, parts) {
  const entries = readdirSync(folder, { withFileTypes: true });
  const files = entries.filter(entry => entry.isFile()).map(entry => entry.name);
  const exterior = files.find(name => /^exterior\.webp$/i.test(name));
  const interiors = files.filter(name => /^interior[-_](\d+)\.webp$/i.test(name))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (exterior && interiors.length >= 2) {
    const path = parts.join('/');
    const asset = name => prefix + '/' + path + '/' + name;
    manifest[path] = {
      exterior: asset(exterior),
      interiorOne: asset(interiors[0]),
      interiorTwo: asset(interiors[1]),
    };
  } else if (exterior || interiors.length) {
    console.warn('[dispatch-cards] Incomplete image set ignored: ' + parts.join('/') +
      ' (required exterior.webp and two interior_XX.webp or interior-XX.webp)');
  }
  for (const entry of entries) {
    if (entry.isDirectory() && /^[a-zA-Z0-9_-]+$/.test(entry.name)) {
      scan(join(folder, entry.name), [...parts, entry.name]);
    }
  }
}

if (existsSync(base)) scan(base, []);
const ordered = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(ordered, null, 2) + '\n');
console.log('[dispatch-cards] Indexed ' + Object.keys(ordered).length + ' complete image sets');
