const fs = require('node:fs');
const path = require('node:path');

/** No remote origin or receipt-provided script receives desktop capabilities. */
function createReceiptRenderer({ BrowserWindow, session, partition = 'branda-receipt-isolated' }) {
  const isolated = session.fromPartition(partition);
  isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolated.setPermissionCheckHandler(() => false);
  isolated.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('data:') }));
  const font = name => fs.readFileSync(path.join(__dirname, 'fonts', name)).toString('base64');
  const fonts = `@font-face{font-family:BrandaNativeArabic;src:url(data:font/ttf;base64,${font('tajawal-regular.ttf')}) format('truetype');font-weight:400;font-display:block}@font-face{font-family:BrandaNativeArabic;src:url(data:font/ttf;base64,${font('tajawal-bold.ttf')}) format('truetype');font-weight:700;font-display:block}body{font-family:BrandaNativeArabic,sans-serif!important}`;
  const makeWindow = () => {
    const win = new BrowserWindow({ show: false, width: 400, height: 900, webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false, webSecurity: true, devTools: false, spellcheck: false } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.on('will-frame-navigate', event => event.preventDefault());
    win.webContents.on('will-attach-webview', event => event.preventDefault());
    return win;
  };
  async function render(html) {
    const win = makeWindow();
    try {
      const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`;
      const document = `<!doctype html><head><meta charset="utf-8">${policy}<style>${fonts}</style></head>${html}`;
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`);
      // Embedded fonts are loaded as page resources and never require receipt JavaScript.
      return win;
    } catch (error) { win.destroy(); throw error; }
  }
  return { makeWindow, render };
}
module.exports = { createReceiptRenderer };
