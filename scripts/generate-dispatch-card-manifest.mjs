/**
 * Build-time inventory of complete dispatch-card image triplets.
 * Add three .webp files under public/images/dispatch_cards/vehicles/<model>/
 * or <model>/<plateShort>/ and the next dev/build/test run refreshes the manifest.
 * Never scan the filesystem from a browser component.
 */
import { existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const roots = [
  {
    base: join(process.cwd(), 'public/images/dispatch_cards/vehicles'),
    prefix: '/images/dispatch_cards/vehicles',
    extPattern: /\.webp$/i,
  },
  {
    base: join(process.cwd(), 'public/images/dispatch-cards'),
    prefix: '/images/dispatch-cards',
    extPattern: /\.(png|webp)$/i,
  },
];
const output = join(process.cwd(), 'lib/dispatchCards/dispatchCardAssetManifest.json');
const manifest = {};

function scan(folder, parts, prefix, extPattern) {
  const entries = readdirSync(folder, { withFileTypes: true });
  const files = entries
    .filter(entry => entry.isFile() && extPattern.test(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));
  const exterior = files.find(name => /^exterior\.(png|webp)$/i.test(name));
  const interiors = files.filter(name => /^interior[-_](\d+)\.(png|webp)$/i.test(name))
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
      ' (required exterior and two interior-01/interior-02 images)');
  }
  for (const entry of entries) {
    if (entry.isDirectory() && /^[a-zA-Z0-9_-]+$/.test(entry.name)) {
      scan(join(folder, entry.name), [...parts, entry.name], prefix, extPattern);
    }
  }
}

for (const root of roots) {
  if (existsSync(root.base)) scan(root.base, [], root.prefix, root.extPattern);
}
const ordered = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(ordered, null, 2) + '\n');
console.log('[dispatch-cards] Indexed ' + Object.keys(ordered).length + ' complete image sets');
