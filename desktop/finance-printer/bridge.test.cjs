const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createPrinterBridge, validOrigin, validateJob } = require('./bridge.cjs');
const origin = 'http://localhost:3100';
const token = 'a'.repeat(64);
const job = { brandId: 'test-cafe', jobId: 'sale:1:customer', copy: 'customer', paper: '80', deviceName: 'Thermal 80', html: '<html><body>إيصال</body></html>' };
test('origin and print payload boundary rejects remote HTTP, path, arbitrary printer inputs', () => {
  assert.equal(validOrigin(origin), true); assert.equal(validOrigin('https://brand.example'), true);
  for (const item of ['http://evil.example', 'file:///tmp', 'https://brand.example/path', 'null', 'https://brand.example/']) assert.equal(validOrigin(item), false);
  assert.equal(validateJob(job), true); assert.equal(validateJob({ ...job, brandId: '../secrets' }), false);
  assert.equal(validateJob({ ...job, copy: 'arbitrary' }), false); assert.equal(validateJob({ ...job, paper: 'A4' }), false);
});
test('loopback pairing, printer allowlist, concurrent dedup, immutable content and crash recovery', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'branda-printer-test-'));
  let calls = 0;
  const adapter = { printers: async () => [{ name: 'Thermal 80', displayName: 'Thermal' }], print: async () => { calls += 1; await new Promise(resolve => setTimeout(resolve, 5)); } };
  let bridge = createPrinterBridge({ origin, token, directory, adapter, port: 0 });
  let address = await bridge.listen();
  const request = (route, body, extra = {}) => fetch(`http://127.0.0.1:${address.port}${route}`, { method: body ? 'POST' : 'GET', headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    assert.equal(bridge.server.address().address, '127.0.0.1');
    assert.equal((await request('/printers', null, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await request('/printers', null, { Authorization: 'Bearer bad' })).status, 401);
    const hostileHost = await new Promise(resolve => { const req = http.get(`http://127.0.0.1:${address.port}/printers`, { headers: { Host: 'evil.example', Origin: origin, Authorization: `Bearer ${token}` } }, result => { result.resume(); resolve(result.statusCode); }); req.on('error', () => resolve(0)); });
    assert.equal(hostileHost, 403);
    assert.deepEqual((await (await request('/printers')).json()).printers, [{ name: 'Thermal 80', displayName: 'Thermal' }]);
    assert.equal((await request('/print', { ...job, deviceName: 'Unknown' })).status, 400);
    const replies = await Promise.all([request('/print', job), request('/print', job)]);
    assert.equal(calls, 1); for (const reply of replies) assert.equal((await reply.json()).status, 'submitted');
    assert.equal((await request('/print', { ...job, html: '<body>changed</body>' })).status, 409);
    assert.equal(calls, 1);
    assert.ok(!fs.readFileSync(path.join(directory, fs.readdirSync(directory)[0]), 'utf8').includes('إيصال'));
    await new Promise(resolve => bridge.server.close(resolve));
    bridge = createPrinterBridge({ origin, token, directory, adapter, port: 0 }); address = await bridge.listen();
    assert.equal((await (await request('/print', job)).json()).status, 'submitted'); assert.equal(calls, 1);
    adapter.print = async () => { calls += 1; throw new Error('unknown delivery'); };
    const uncertain = { ...job, jobId: 'sale:2:customer' };
    assert.equal((await (await request('/print', uncertain)).json()).status, 'uncertain');
    assert.equal((await (await request('/print', uncertain)).json()).status, 'uncertain'); assert.equal(calls, 2);
    // Preparation is an independent copy even when sent to the same physical printer.
    assert.equal((await (await request('/print', { ...uncertain, copy: 'preparation' })).json()).status, 'uncertain'); assert.equal(calls, 3);
  } finally { await new Promise(resolve => bridge.server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); }
});
