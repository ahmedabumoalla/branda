const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 8 * 1024 * 1024;
function validOrigin(value) {
  try { const url = new URL(value); return url.origin === value && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))); } catch { return false; }
}
function equalToken(value, token) {
  const input = Buffer.from(value || ''); const expected = Buffer.from(`Bearer ${token}`);
  return input.length === expected.length && crypto.timingSafeEqual(input, expected);
}
function validateJob(input) {
  if (!input || typeof input !== 'object') return false;
  const { brandId, jobId, copy, html, deviceName, paper } = input;
  return typeof brandId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(brandId)
    && typeof jobId === 'string' && /^[a-zA-Z0-9_:.-]{1,200}$/.test(jobId)
    && ['customer', 'preparation'].includes(copy) && ['58', '80'].includes(paper)
    && typeof deviceName === 'string' && deviceName.length > 0 && deviceName.length <= 256
    && typeof html === 'string' && html.length > 0 && Buffer.byteLength(html) < MAX_BYTES;
}
/** Each request is durably claimed before OS submission. Unknown delivery never retries automatically. */
function createPrinterBridge({ origin, token, directory, adapter, port = 17841 }) {
  if (!validOrigin(origin) || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid local pairing configuration');
  fs.mkdirSync(directory, { recursive: true });
  let queue = Promise.resolve(); let pending = 0;
  const send = (response, status, payload) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(payload)); };
  const server = http.createServer(async (request, response) => {
    const host = `127.0.0.1:${server.address().port}`;
    if (request.headers.host !== host || request.headers.origin !== origin) { send(response, 403, { error: 'forbidden' }); return; }
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
      response.setHeader('Access-Control-Allow-Private-Network', 'true');
      response.writeHead(204); response.end(); return;
    }
    if (!equalToken(request.headers.authorization, token)) { send(response, 401, { error: 'unauthorized' }); return; }
    if (request.method === 'GET' && request.url === '/printers') {
      try { send(response, 200, { printers: (await adapter.printers()).map(item => ({ name: item.name, displayName: item.displayName || item.name })) }); }
      catch { send(response, 503, { error: 'printers_unavailable' }); }
      return;
    }
    if (request.method !== 'POST' || request.url !== '/print') { send(response, 404, { error: 'not_found' }); return; }
    if (!request.headers['content-type']?.startsWith('application/json')) { send(response, 415, { error: 'json_required' }); return; }
    if (pending >= 20) { send(response, 429, { error: 'queue_busy' }); return; }
    let length = 0; const chunks = [];
    try {
      for await (const chunk of request) { length += chunk.length; if (length > MAX_BYTES) { send(response, 413, { error: 'request_too_large' }); return; } chunks.push(chunk); }
      const job = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!validateJob(job)) { send(response, 400, { error: 'invalid_job' }); return; }
      const key = crypto.createHash('sha256').update(`${origin}\n${job.brandId}\n${job.jobId}\n${job.copy}`).digest('hex');
      const filename = path.join(directory, `${key}.json`);
      // Stable content and target bind the idempotency key; customer data is not written to disk.
      const digest = crypto.createHash('sha256').update(JSON.stringify({ html: job.html, deviceName: job.deviceName, paper: job.paper })).digest('hex');
      const operation = async () => {
        if (fs.existsSync(filename)) {
          const prior = JSON.parse(fs.readFileSync(filename, 'utf8'));
          if (prior.digest !== digest) { send(response, 409, { error: 'job_conflict' }); return; }
          send(response, 200, { jobId: job.jobId, status: prior.status === 'submitted' ? 'submitted' : 'uncertain' }); return;
        }
        const printers = await adapter.printers();
        if (!printers.some(printer => printer.name === job.deviceName)) { send(response, 400, { error: 'unknown_printer' }); return; }
        fs.writeFileSync(filename, JSON.stringify({ digest, status: 'uncertain', at: new Date().toISOString() }), { flag: 'wx', mode: 0o600, flush: true });
        try {
          await adapter.print(job);
          const temporary = `${filename}.tmp`;
          fs.writeFileSync(temporary, JSON.stringify({ digest, status: 'submitted', at: new Date().toISOString() }), { mode: 0o600, flush: true });
          fs.renameSync(temporary, filename);
          send(response, 200, { jobId: job.jobId, status: 'submitted' });
        } catch { send(response, 200, { jobId: job.jobId, status: 'uncertain' }); }
      };
      pending += 1;
      queue = queue.then(operation).catch(() => { if (!response.headersSent) send(response, 503, { error: 'local_storage_or_printer_failure' }); }).finally(() => { pending -= 1; });
    } catch { if (!response.headersSent) send(response, 400, { error: 'invalid_request' }); }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000;
  return { server, listen: () => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(server.address()); }); }) };
}
module.exports = { createPrinterBridge, validateJob, validOrigin };
