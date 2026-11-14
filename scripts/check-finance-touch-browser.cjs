/* Isolated real-browser check: original POS, Modal and keypad; business services disabled. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const WebSocket = globalThis.WebSocket || require('ws');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output', 'naqwa-touch-keypad-20261114', String(Date.now()));
fs.mkdirSync(output, { recursive: true });
const esbuild = require(process.env.TOUCH_ESBUILD || 'C:/Projects/branda-platform/offline-finance/node_modules/esbuild');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const empty = names => names.map(name => `export function ${name}(){return null}`).join('\n');
const mocks = {
  'next/navigation': 'export const useRouter=()=>({replace(){}});',
  'next/link': 'import React from "react"; export default function Link({children,...props}){return <a {...props}>{children}</a>}',
  'next/image': 'import React from "react"; export default function Image({unoptimized,...props}){return <img {...props}/>}',
  '@/app/actions/finance-access': 'export function logoutFinanceAction(){throw Error("Fixture never logs out real users")}',
  './finance-operation-form': empty(['FinanceOperationForm']),
  './finance-refund-requests': empty(['FinanceRefundRequests']),
  './finance-receipt-dialog': empty(['FinanceReceiptDialog']),
  './finance-pos-fullscreen': empty(['FinancePosFullscreen']),
  './finance-pos-actions': empty(['FinancePosActions']),
  './finance-pos-customer': empty(['FinancePosCustomerField', 'FinancePosPager']) + 'export const usePosCustomer=()=>({normalized:"",reset(){},payload(){return {}}});export const financePosCustomerNotice=()=>"";',
  './use-pos-finance': 'export const usePosFinance=snapshot=>({snapshot,pending:false,stale:false,error:"",message:"",clearFeedback(){},refresh(){},offline:{sales:[],ready:true,pending:[]},execute(){window.fixtureWrites++;throw Error("Business writes forbidden")}});',
  './finance-pos-offline-status': empty(['FinancePosOfflineStatus']),
  './use-finance-printer': 'export const useFinancePrinter=()=>({ready:false,autoEnabled:false});',
  './use-finance-invoice-messages': 'export const useFinanceInvoiceMessages=()=>({entries:{},loading:false});',
  './finance-invoice-message-status': empty(['FinanceInvoiceMessageStatus']),
};
const snapshot = { cafe: { id: 'fixture', name: 'Touch test', slug: 'touch-test', businessCategory: 'butcher_shops' }, userId: 'fixture', role: 'cashier', canManage: false, initialized: true, warehouses: [{ id: 'warehouse', name: 'Test', active: true }], products: [{ id: 'meat', name: 'Touch meat', price: 0, available: true, stockTracked: false, itemId: null, imageUrl: null, category: 'Test', butcherDetails: { meatType: 'calf', origin: 'Test', units: [{ id: 'kg', label: 'kg', price: 0, priceMode: 'cashier' }] } }], shifts: [], accounts: [{ id: 'cash', kind: 'cash', active: true, is_cashier_drawer: true, availableWithoutShift: true, is_primary: true }], stock: [], settings: { vat_rate: 15, tax_inclusive: true }, parties: [], documents: [], staff: [] };
let server, chrome, ws;
const report = { date: new Date().toISOString(), node: process.version, source: {}, checks: [], errors: [] };
async function main() {
  for (const file of ['components/finance/finance-pos.tsx', 'components/finance/finance-touch-number-input.tsx', 'components/finance/finance-touch-number-input.module.css', 'components/finance/finance-pos-locale.tsx']) report.source[file] = require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  await esbuild.build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {FinancePOS} from './components/finance/finance-pos';window.fixtureWrites=0;createRoot(document.getElementById('root')).render(<FinancePOS initialSnapshot={${JSON.stringify(snapshot)}}/>);`, resolveDir: root, loader: 'tsx' }, outfile: path.join(output, 'fixture.js'), bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'isolated-services', setup(build) { build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: 'fixture' } : null); build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'tsx', resolveDir: root })); } }] });
  // Reuse built global Tailwind only; component CSS comes from the current source above.
  const cssDir = path.join(root, '.next/static/css');
  const globalFile = fs.readdirSync(cssDir).find(file => fs.readFileSync(path.join(cssDir, file), 'utf8').includes('.fixed{position:fixed}'));
  assert(globalFile, 'Build application once to provide actual global utility CSS');
  report.globalCss = { file: path.join(cssDir, globalFile), sha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(cssDir, globalFile))).digest('hex') };
  fs.copyFileSync(path.join(cssDir, globalFile), path.join(output, 'global.css'));
  fs.writeFileSync(path.join(output, 'index.html'), '<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/global.css"><link rel="stylesheet" href="/fixture.css"></head><body style="margin:0"><div id="root"></div><script src="/fixture.js"></script></body></html>');
  server = http.createServer((req, res) => { const file = path.join(output, req.url === '/' ? 'index.html' : path.basename(req.url)); if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); } res.setHeader('content-type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : 'text/html;charset=utf-8'); res.end(fs.readFileSync(file)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = path.join(output, 'chrome-profile');
  chrome = spawn(process.env.CHROME_EXE || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; !fs.existsSync(portFile) && i < 100; i++) await wait(100);
  const [port, endpoint] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
  ws = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 0; const pending = new Map();
  ws.onmessage = event => { const message = JSON.parse(event.data); if (message.id) { const item = pending.get(message.id); if (item) { pending.delete(message.id); clearTimeout(item.timer); message.error ? item.reject(Error(JSON.stringify(message.error))) : item.resolve(message.result); } } else if (message.method === 'Runtime.exceptionThrown') report.errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text); };
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++nextId, timer = setTimeout(() => reject(Error(`CDP timeout: ${method}`)), 15000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  report.chrome = await call('Browser.getVersion');
  for (const width of [1366, 360]) {
    const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
    const cdp = (method, params) => call(method, params, sessionId);
    const evaluate = async expression => { const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
    await cdp('Runtime.enable'); await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 360 });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
    await cdp('Page.navigate', { url: origin });
    const until = async (expression, label) => { for (let i = 0; i < 80; i++) { if (await evaluate(`Boolean(${expression})`)) return; await wait(75); } throw Error(`Timeout ${width}: ${label}`); };
    const tap = async expression => { const point = await evaluate(`(()=>{const el=${expression};if(!el)throw Error('Missing tap target');el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, radiusX: 2, radiusY: 2, force: 1 }] }); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(70); };
    const input = hint => `document.querySelector('input[aria-describedby="${hint}"]')`;
    const panel = 'document.querySelector("[role=dialog][aria-label]")';
    const key = label => `${panel}?.querySelector('button[aria-label="${label}"]')`;
    const textButton = (text, scope = 'document') => `[...${scope}.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(text)})`;
    const productButton = `document.querySelector('button[aria-label*="Touch meat"]')`;
    await until(productButton, 'POS product');
    await tap(productButton);
    await until(`${input('butcher-quantity-hint')} && document.querySelector('[aria-modal=true]')`, 'unit picker');
    await tap(input('butcher-quantity-hint'));
    await until(panel, 'quantity keypad');
    await tap(textButton('مسح الكل', panel));
    for (const digit of ['1', 'الفاصلة العشرية', '2', '5']) await tap(key(digit));
    assert.equal(await evaluate(`${input('butcher-quantity-hint')}.value`), '1.25');
    assert.equal(await evaluate(`document.activeElement===${input('butcher-quantity-hint')}`), true);
    assert.equal(await evaluate(`${input('butcher-quantity-hint')}.inputMode`), 'none');
    const geometry = await evaluate(`(()=>{const p=${panel};const r=p.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,minButton:Math.min(...[...p.querySelectorAll('button')].map(b=>b.getBoundingClientRect().height))}})()`);
    assert(geometry.left >= 0 && geometry.right <= geometry.width + 1 && geometry.top >= 0 && geometry.bottom <= geometry.height + 1, JSON.stringify(geometry)); assert(geometry.minButton >= 48);
    await tap(textButton('تم', panel));
    assert.equal(await evaluate(`Boolean(${panel})`), false); assert.equal(await evaluate('Boolean(document.querySelector("[aria-modal=true]"))'), true);
    await tap(input('butcher-price-hint')); await until(panel, 'price keypad');
    await tap(textButton('مسح الكل', panel)); for (const digit of ['7', '5', 'الفاصلة العشرية', '5']) await tap(key(digit));
    assert.equal(await evaluate(`${input('butcher-price-hint')}.value`), '75.5');
    await tap(textButton('تم', panel)); await tap(textButton('إضافة إلى الطلب'));
    const cartInput = `document.querySelector('input[aria-label*="Touch meat"]')`;
    await until(cartInput, 'cart row');
    await tap(cartInput); await until(panel, 'cart keypad'); await tap(textButton('مسح الكل', panel));
    assert.equal(await evaluate(`${cartInput}.value`), ''); assert.equal(await evaluate(`${cartInput}.getAttribute('aria-invalid')`), 'true');
    assert.equal(await evaluate(`${textButton('الدفع وإصدار الإيصال')}.disabled`), true);
    for (const digit of ['1', 'الفاصلة العشرية']) await tap(key(digit));
    assert.equal(await evaluate(`${cartInput}.value`), '1.');
    for (const digit of ['2', '5', '0']) await tap(key(digit));
    assert.equal(await evaluate(`${cartInput}.value`), '1.250');
    await tap(textButton('تم', panel)); assert.equal(await evaluate(`Boolean(${panel})`), false);
    assert.equal(await evaluate('window.fixtureWrites'), 0);
    report.checks.push({ width, geometry, quantity: '1.25', manualPrice: '75.5', cartRaw: '1.250', clearKeepsRow: true, invalidBlocksCheckout: true, doneKeepsParentDialog: true, inputMode: 'none', businessWrites: 0 });
    const screenshot = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(output, `viewport-${width}.png`), Buffer.from(screenshot.data, 'base64'));
  }
  assert.deepEqual(report.errors, []);
  await call('Browser.close');
}
main().then(() => { report.ok = true; }).catch(error => { report.ok = false; report.failure = error.stack; process.exitCode = 1; }).finally(() => { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ok: report.ok, report: path.join(output, 'report.json'), failure: report.failure, checks: report.checks.length }, null, 2)); ws?.close(); chrome?.kill(); server?.close(); });
