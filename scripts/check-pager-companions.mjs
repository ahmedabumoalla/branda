import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';

const hash = data => crypto.createHash('sha256').update(data).digest('hex');
export function companionSourceHash(root) {
  const paths = fs.readdirSync(root, { recursive: true }).map(p => p.replaceAll('\\', '/'))
    .filter(p => !p.split('/').some(part => ['build', '.gradle'].includes(part)))
    .filter(p => /\.(java|gradle|properties|xml|swift|plist|sh)$/.test(p) && !p.endsWith('local.properties')).sort();
  return hash(paths.map(p => p + '\0' + fs.readFileSync(path.join(root, p), 'utf8').replaceAll('\r\n', '\n')).join('\0'));
}
const manifest = JSON.parse(fs.readFileSync('public/downloads/pager-companions.json', 'utf8'));
for (const item of manifest.artifacts) {
  const file = `public/downloads/${item.file}`;
  assert.ok(['branda-pager-android.apk', 'branda-pager-macos.zip'].includes(item.file));
  const data = fs.readFileSync(file);
  assert.equal(data.subarray(0, 4).toString('hex'), '504b0304');
  assert.equal(hash(data), item.sha256, `${item.platform}: binary changed after verification`);
  assert.equal(data.length, item.bytes);
  assert.equal(companionSourceHash(`companions/${item.platform}`), item.sourceSha256, `${item.platform}: rebuild after source changes`);
}
const source = fs.readFileSync('app/pager/download/page.tsx', 'utf8');
for (const item of manifest.artifacts) assert.ok(source.includes(`/downloads/${item.file}`));
console.log('Both companion downloads match their verified binary and source identities');
