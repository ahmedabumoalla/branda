const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(name => name in mocks ? mocks[name] : require(name), exports);
  return exports;
}
async function main() {
  const shared = load('lib/finance/treasury-attachments.ts');
  assert.equal(shared.treasuryAttachmentName('../unsafe\nfile.html'), '.._unsafe_file.html');
  assert.equal(shared.treasuryAttachmentName('\u202efdp.exe'), '_fdp.exe');
  assert.equal(shared.treasuryAttachmentName('a'.repeat(400)).length, 180);
  const pdf = new File(['%PDF-dummy'], 'invoice.pdf', { type: 'application/pdf' });
  assert.equal(await shared.compressTreasuryImage(pdf), pdf, 'Nonimages retain exact bytes');
  const image = new File(['originalbytes'], 'invoice.jpg', { type: 'image/jpeg' });
  global.createImageBitmap = async () => ({ width: 3000, height: 4000, close() {} });
  let blob = new Blob(['too large '.repeat(30)]);
  global.document = { createElement: () => ({ getContext: () => ({ drawImage() {} }), toBlob: callback => callback(blob) }) };
  assert.equal(await shared.compressTreasuryImage(image), image, 'Larger conversion preserves original');
  blob = new Blob(['small'], { type: 'image/webp' });
  const compressed = await shared.compressTreasuryImage(image); assert.equal(compressed.type, 'image/webp'); assert.equal(compressed.name, 'invoice.webp');
  delete global.createImageBitmap; delete global.document;
  const documentId = '00000000-0000-4000-8000-000000000001', id = '00000000-0000-4000-8000-000000000002';
  let role = 'owner', rpcError = false, storageCalls = [], rpcCalls = [], bucketPublic = false, stale = [], removeFails = false, bucketLimit = null;
  const stored = { id, original_name: 'invoice.html', size_bytes: 10, storage_path: 'tenant/doc/id', uploaded: false, created_at: 'today' };
  const client = { rpc: async (_, args) => {
    rpcCalls.push(args);
    if (rpcError) return { error: new Error('private detail') };
    return { data: args.p_action === 'stale' ? stale : !args.p_action ? [stored] : { ...stored, uploaded: args.p_action === 'finalize' } };
  } };
  const storage = { getBucket: async () => ({ data: { public: bucketPublic, file_size_limit: bucketLimit } }), from: name => {
    assert.equal(name, shared.TREASURY_ATTACHMENT_BUCKET);
    return {
      createSignedUploadUrl: async (path, opts) => { storageCalls.push(['upload', path, opts]); return { data: { path, token: 'test-token' } }; },
      remove: async paths => { storageCalls.push(['remove', paths]); return { error: removeFails ? {} : null }; },
      createSignedUrl: async path => { storageCalls.push(['download', path]); return { data: { signedUrl: 'https://storage.example/signed-file' } }; },
    };
  } };
  const dal = load('lib/data/finance-treasury-attachments.ts', {
    'server-only': {}, '@/lib/data/brand-finance': { getBrandFinanceContext: async () => ({ client, cafe: { id: 'tenant', role } }) },
    '@/lib/supabase/admin': { createAdminClient: () => ({ storage }) }, '@/lib/finance/treasury-attachments': shared,
  });
  const input = { id, documentId, name: 'invoice.html', size: 10 };
  role = 'cashier'; await assert.rejects(() => dal.prepareTreasuryAttachment('brand', input)); assert.equal(storageCalls.length, 0); assert.equal(rpcCalls.length, 0);
  role = 'owner'; rpcError = true;
  await assert.rejects(() => dal.prepareTreasuryAttachment('other-brand', input));
  await assert.rejects(() => dal.downloadTreasuryAttachment('other-brand', documentId, id)); assert.equal(storageCalls.length, 0, 'No signed URL or download before authoritative RPC');
  rpcError = false;
  for (const size of [0, -1, NaN, Infinity, 1.5]) await assert.rejects(() => dal.prepareTreasuryAttachment('brand', { ...input, size })); assert.equal(storageCalls.length, 0);
  bucketPublic = true; await assert.rejects(() => dal.prepareTreasuryAttachment('brand', input)); assert.equal(storageCalls.length, 0); bucketPublic = false;
  const prepared = await dal.prepareTreasuryAttachment('brand', input); assert.equal(prepared.token, 'test-token'); assert.deepEqual(storageCalls.at(-1), ['upload', stored.storage_path, { upsert: false }]);
  await dal.prepareTreasuryAttachment('brand', { ...input, size: 20971521 });
  assert.equal(rpcCalls.at(-1).p_size, 20971521, 'No artificial 20MiB application limit');
  bucketLimit = 10; await assert.rejects(() => dal.prepareTreasuryAttachment('brand', { ...input, size: 11 })); bucketLimit = null;
  assert.equal('storage_path' in prepared.attachment, false);
  assert.equal((await dal.finalizeTreasuryAttachment('brand', documentId, id)).id, id);
  assert.equal('storage_path' in (await dal.listTreasuryAttachments('brand', documentId))[0], false);
  stale = [{ ...stored, id: 'expired-id', storage_path: 'expired/path' }]; removeFails = true;
  rpcCalls = []; await dal.prepareTreasuryAttachment('brand', input); assert.equal(rpcCalls.some(x => x.p_action === 'purge'), false, 'Failed object removal preserves metadata for future cleanup');
  removeFails = false; rpcCalls = []; await dal.prepareTreasuryAttachment('brand', input); assert.equal(rpcCalls.some(x => x.p_action === 'purge'), true);
  const routes = load('app/api/finance/[slug]/treasury-attachments/[id]/route.ts', { '@/lib/data/finance-treasury-attachments': dal });
  const url = `http://localhost:3100/api/finance/brand/treasury-attachments/${id}?documentId=${documentId}`;
  const ctx = { params: Promise.resolve({ slug: 'brand', id }) };
  const nativeFetch = global.fetch;
  global.fetch = async (target, options) => { assert.equal(target, 'https://storage.example/signed-file'); assert.equal(options.redirect, 'error'); return new Response('<script>bad()</script>'); };
  const response = await routes.GET(new Request(url), ctx);
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.match(response.headers.get('content-disposition'), /^attachment;/); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('content-security-policy'), 'sandbox');
  assert.equal(await response.text(), '<script>bad()</script>', 'HTML bytes are downloaded, not executed or corrupted');
  assert.equal((await routes.POST(new Request(url, { method: 'POST', headers: { origin: 'https://foreign.example' } }), ctx)).status, 403);
  rpcError = true; assert.equal((await routes.GET(new Request(url), ctx)).status, 403);
  global.fetch = nativeFetch;
  console.log('PASS treasury attachment DAL/routes: authorization before signing/storage, private bucket, validation, cleanup retry, safe HTML download, CSRF and image preservation');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
