const { app, BrowserWindow, dialog, session } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createPrinterBridge, validOrigin } = require('./bridge.cjs');
const { createReceiptRenderer } = require('./renderer.cjs');

app.setName('BrandaPrinter');
app.setPath('userData', path.join(app.getPath('appData'), 'BrandaFinancePrinter'));
if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(async () => {
  const directory = app.getPath('userData');
  const pairingPath = path.join(directory, 'pairing.json');
  const configuredOrigin = process.argv.find(arg => arg.startsWith('--origin='))?.slice('--origin='.length);
  let pairing;
  try { pairing = JSON.parse(fs.readFileSync(pairingPath, 'utf8')); } catch { /* First start must pair explicitly. */ }
  if (configuredOrigin) {
    if (!validOrigin(configuredOrigin)) throw new Error('Use an exact HTTPS origin or localhost development origin');
    if (pairing?.origin !== configuredOrigin) pairing = { origin: configuredOrigin, token: crypto.randomBytes(32).toString('hex') };
  }
  if (!pairing || !validOrigin(pairing.origin)) throw new Error('First run requires --origin=https://your-branda-host');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(pairingPath, JSON.stringify(pairing), { mode: 0o600 });
  const renderer = createReceiptRenderer({ BrowserWindow, session });
  const inventory = renderer.makeWindow();
  const adapter = {
    printers: () => inventory.webContents.getPrintersAsync(),
    print: async job => {
      const win = await renderer.render(job.html);
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Print status unknown')), 30_000);
          // The selected thermal driver owns cut/feed/roll length. CSS controls 58/80 mm receipt content.
          win.webContents.print({ silent: true, deviceName: job.deviceName, usePrinterDefaultPageSize: true, printBackground: false, margins: { marginType: 'none' }, copies: 1 }, success => { clearTimeout(timer); success ? resolve() : reject(new Error('Print rejected')); });
        });
      } finally { win.destroy(); }
    },
  };
  const bridge = createPrinterBridge({ ...pairing, directory: path.join(directory, 'jobs'), adapter });
  await bridge.listen();
  app.on('before-quit', () => bridge.server.close());
  await dialog.showMessageBox({ type: 'info', title: 'Branda Printer', message: 'خدمة طباعة برندة جاهزة', detail: `عنوان برندة المسموح\n${pairing.origin}\n\nانسخ رمز الربط إلى قسم إعداد الطابعة\n${pairing.token}\n\nاترك الخدمة تعمل أثناء استخدام الكاشير`, buttons: ['نسخ رمز الربط', 'إغلاق الرسالة'] }).then(result => { if (result.response === 0) require('electron').clipboard.writeText(pairing.token); });
}).catch(error => { dialog.showErrorBox('Branda Printer', error.message); app.quit(); });
// A local bridge remains available after closing its pairing message.
app.on('window-all-closed', () => {});
