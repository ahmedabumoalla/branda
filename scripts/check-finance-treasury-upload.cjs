const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const output = {};
const code = ts.transpileModule(fs.readFileSync('lib/finance/treasury-upload.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('require', 'exports', code)(name => name.includes('env') ? { requireSupabaseUrl: () => 'https://test-project.supabase.co' } : { TREASURY_ATTACHMENT_BUCKET: 'private-files' }, output);

async function main() {
  const nativeFetch = global.fetch;
  try {
    let offset = 0, creates = 0, heads = 0, chunks = 0, interrupted = true;
    const size = 21 * 1024 * 1024 + 17;
    const file = new File([new Uint8Array(size)], 'invoice.pdf', { type: 'application/pdf' });
    global.fetch = async (target, request) => {
      assert.equal(request.headers['x-signature'], 'private-signed-token');
      assert.equal(request.headers['Tus-Resumable'], '1.0.0');
      assert.equal(request.redirect, 'error');
      assert.ok(String(target).startsWith('https://test-project.storage.supabase.co/storage/v1/upload/resumable'));
      assert.equal(request.headers['x-upsert'], undefined, 'Financial attachments never overwrite existing objects');
      if (request.method === 'POST') {
        creates++;
        assert.equal(Number(request.headers['Upload-Length']), size);
        assert.match(request.headers['Upload-Metadata'], /contentType YXBwbGljYXRpb24vb2N0ZXQtc3RyZWFt/);
        return new Response(null, { status: 201, headers: { Location: '/storage/v1/upload/resumable/test-upload' } });
      }
      if (request.method === 'HEAD') { heads++; return new Response(null, { headers: { 'Upload-Offset': String(offset) } }); }
      assert.equal(request.method, 'PATCH');
      assert.equal(Number(request.headers['Upload-Offset']), offset);
      assert.ok(request.body instanceof Blob);
      assert.ok(request.body.size <= 6 * 1024 * 1024, 'Bounded memory regardless of file length');
      chunks++; offset += request.body.size;
      if (chunks === 2 && interrupted) { interrupted = false; throw new Error('lost response after server accepted bytes'); }
      return new Response(null, { status: 204, headers: { 'Upload-Offset': String(offset) } });
    };
    await assert.rejects(() => output.uploadTreasuryFile(file, 'tenant/doc/id', 'private-signed-token'), /lost response/);
    const progress = [];
    await output.uploadTreasuryFile(file, 'tenant/doc/id', 'private-signed-token', done => progress.push(done));
    assert.equal(creates, 1, 'Retry resumes the same upload instead of creating another');
    assert.equal(heads, 1); assert.equal(offset, size); assert.equal(chunks, 4);
    assert.equal(progress[0], 12 * 1024 * 1024); assert.equal(progress.at(-1), size);
    global.fetch = async () => new Response(null, { status: 201, headers: { Location: 'https://evil.example/steal-token' } });
    await assert.rejects(() => output.uploadTreasuryFile(file, 'other/path', 'private-signed-token'));
    global.fetch = async () => new Response(null, { status: 413 });
    await assert.rejects(() => output.uploadTreasuryFile(file, 'provider-cap/path', 'private-signed-token'));
    console.log('PASS TUS: >20MiB, fixed chunks, progress, lost-response resume, signed tokens, immutable objects, cross-origin rejection and provider error');
  } finally { global.fetch = nativeFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
