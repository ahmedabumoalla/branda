// Native smoke only: never invokes webContents.print or changes printer configuration.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { createReceiptRenderer } = require('./renderer.cjs');
const { createPrinterBridge } = require('./bridge.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'branda-native-smoke-'));
app.setPath('userData', path.join(directory, 'profile'));
const evidence = path.resolve(__dirname, '../../output/finance-printer-native-smoke.json');
app.whenReady().then(async () => {
  const renderer = createReceiptRenderer({ BrowserWindow, session, partition: 'branda-native-smoke' });
  const inventory = renderer.makeWindow();
  const origin = 'https://offline.invalid'; const token = crypto.randomBytes(32).toString('hex');
  const bridge = createPrinterBridge({ origin, token, port: 0, directory: path.join(directory, 'jobs'), adapter: { printers: () => inventory.webContents.getPrintersAsync(), print: () => { throw new Error('Physical print forbidden during smoke'); } } });
  let receipt;
  try {
    const address = await bridge.listen();
    const response = await fetch(`http://127.0.0.1:${address.port}/printers`, { headers: { Origin: origin, Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    const { printers } = await response.json();
    receipt = await renderer.render('<html lang="ar" dir="rtl"><head><title>Offline Arabic receipt</title><style>body{font-size:18px}strong{font-weight:700}</style></head><body><h1>إيصال اختبار دون طباعة</h1><p>قهوة عربية</p><strong>الإجمالي ٤٨٫٠٠ ر س</strong><script>document.title="SCRIPT_EXECUTED";document.body.innerHTML=""</script><img src="https://offline.invalid/forbidden.png"></body></html>');
    assert.equal(receipt.webContents.getTitle(), 'Offline Arabic receipt');
    const preferences = receipt.webContents.getLastWebPreferences();
    const inspection = { scriptExecuted: receipt.webContents.getTitle() === 'SCRIPT_EXECUTED', javascript: preferences.javascript, nodeIntegration: preferences.nodeIntegration, contextIsolation: preferences.contextIsolation, sandbox: preferences.sandbox };
    assert.deepEqual(inspection, { scriptExecuted: false, javascript: false, nodeIntegration: false, contextIsolation: true, sandbox: true });
    const pdf = await receipt.webContents.printToPDF({ pageSize: { width: 80 / 25.4, height: 120 / 25.4 }, printBackground: false });
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    assert.ok(pdf.includes(Buffer.from('Tajawal-Regular')), 'Regular Arabic font must be embedded in offline PDF');
    assert.ok(pdf.includes(Buffer.from('Tajawal-Bold')), 'Bold Arabic font must be embedded in offline PDF');
    fs.mkdirSync(path.dirname(evidence), { recursive: true });
    fs.writeFileSync(path.join(path.dirname(evidence), 'finance-printer-native-smoke.pdf'), pdf);
    fs.writeFileSync(evidence, JSON.stringify({ at: new Date().toISOString(), runtime: process.versions, passed: true, printers: printers.map(item => item.name), checks: inspection, pdfBytes: pdf.length, physicalPrints: 0, systemChanges: false }, null, 2));
  } finally {
    if (receipt) receipt.destroy(); inventory.destroy();
    await new Promise(resolve => bridge.server.close(resolve));
  }
  app.exit(0);
}).catch(error => { fs.mkdirSync(path.dirname(evidence), { recursive: true }); fs.writeFileSync(evidence, JSON.stringify({ at: new Date().toISOString(), passed: false, error: error.message }, null, 2)); app.exit(1); });
app.on('window-all-closed', () => {});
