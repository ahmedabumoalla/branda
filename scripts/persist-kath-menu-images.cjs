// User-authorized preservation of the exact images in Kath's original menu
// Read-only without --apply; never deletes or overwrites existing assets
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const { createClient } = require('@supabase/supabase-js');
const cafeId = 'fbd92cd0-c4b6-41b5-81dd-1d45a01d01e8';
const apply = process.argv.includes('--apply');
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }, realtime: { transport: require('next/dist/compiled/ws') },
});
const bucket = client.storage.from('menu-products');
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
async function checked(query) {
  const {data, error} = await query;
  if (error) throw new Error(error.message);
  return data;
}
async function run() {
  const writer = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {persistSession:false, autoRefreshToken:false}, realtime:{transport:require('next/dist/compiled/ws')},
  });
  if (apply) {
    assert.ok(process.env.KATH_ADMIN_EMAIL && process.env.KATH_ADMIN_PASSWORD, 'An authorized admin login is required');
    await checked(writer.auth.signInWithPassword({email:process.env.KATH_ADMIN_EMAIL,password:process.env.KATH_ADMIN_PASSWORD}));
  }
  const rows = await checked(client.from('menu_products').select('*').eq('cafe_id', cafeId).is('deleted_at', null));
  assert.equal(rows.length, 67, 'Catalog changed; review scope');
  const metadata = await checked(client.storage.getBucket('menu-products'));
  assert.equal(metadata.public, false);
  const report = { saved: [], missing: [], existing: [] };
  const directory = '.codex-tmp/kath-image-preservation';
  if (apply) {
    await fs.mkdir(directory, {recursive: true});
    await fs.writeFile(`${directory}/before-${Date.now()}.json`, JSON.stringify(rows, null, 2), {flag:'wx'});
  }
  async function preserveRow(row) {
    if (row.image_storage_path) { report.existing.push(row.id); return; }
    const url = new URL(row.image_url);
    assert.equal(url.origin, 'https://kath.great-site.net');
    assert.ok(url.pathname.startsWith('/uploads/'));
    const response = await fetch(url, {redirect:'error', signal:AbortSignal.timeout(20000)});
    if (response.status === 404) { report.missing.push({id:row.id, name:row.name}); return; }
    assert.equal(response.status, 200, `Image request failed: ${row.id}`);
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      assert.ok(size <= 6 * 1024 * 1024, 'Unexpected image size');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    const image = await sharp(bytes, {limitInputPixels:40000000}).metadata();
    assert.ok(['jpeg','png','webp','avif'].includes(image.format));
    assert.ok(image.width > 0 && image.height > 0);
    const digest = hash(bytes);
    const path = `${cafeId}/${row.id}/preserved-${digest}.${image.format}`;
    if (apply) {
      const existing = await checked(bucket.list(`${cafeId}/${row.id}`, {search:`preserved-${digest}`}));
      if (!existing.some(file=>file.name === path.split('/').pop())) {
        await checked(bucket.upload(path, bytes, {contentType:`image/${image.format}`, upsert:false}));
      }
      const blob = await checked(bucket.download(path));
      assert.equal(hash(Buffer.from(await blob.arrayBuffer())), digest, 'Stored bytes differ');
      const updated = await checked(writer.from('menu_products').update({image_storage_path:path})
        .eq('cafe_id', cafeId).eq('id', row.id).eq('image_url', row.image_url)
        .eq('updated_at', row.updated_at).is('image_storage_path', null).is('deleted_at', null).select('*'));
      assert.equal(updated.length, 1, 'Concurrent product edit; preserved file left intact');
      for (const key of Object.keys(row).filter(key=>!['image_storage_path','updated_at'].includes(key))) {
        assert.deepEqual(updated[0][key], row[key], `Unrelated field changed: ${key}`);
      }
      const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth:{persistSession:false}, realtime:{transport:require('next/dist/compiled/ws')},
      });
      assert.equal(await checked(anon.rpc('can_access_public_storage_object', {p_bucket:'menu-products',p_storage_path:path})), true);
    }
    report.saved.push({id:row.id, name:row.name, path, sha256:digest});
    console.log(`${apply ? 'SAVED' : 'READY'} ${row.id}`);
  }
  for (let offset=0; offset<rows.length; offset+=4) {
    const results = await Promise.allSettled(rows.slice(offset,offset+4).map(preserveRow));
    const failure = results.find(result=>result.status === 'rejected');
    if (failure) throw failure.reason;
  }
  if (apply) await fs.writeFile(`${directory}/result-${Date.now()}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({apply,saved:report.saved.length,existing:report.existing.length,missing:report.missing}));
  if (apply) await writer.auth.signOut({scope:'local'});
}
run().catch(error=>{console.error(error.message);process.exitCode=1});
