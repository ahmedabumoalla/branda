// Source/QR verification without a browser or installed printer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const sharp = require('sharp');
const jsQR = require('jsqr');
const qr = require('./assets/qr.js');

(async () => {
  const root = __dirname;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'branda-print-'));
  try {
    const normalized = await sharp(path.join(root, 'assets/branda-logo.png')).resize({ width: 300, height: 150, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    assert(normalized.length < 250000);
    const logo = `data:image/png;base64,${normalized.toString('base64')}`;
    fs.writeFileSync(path.join(temporary, 'logo.txt'), logo);
    const source = `import sys,json,tempfile,uuid,datetime
from pathlib import Path
from butcher import Store
with tempfile.TemporaryDirectory() as data:
 s=Store(data)
 s.setup({'company':'ملحمة الاختبار','password':'print-test-password'})
 s.settings({'company':'ملحمة الاختبار','tax_number':'310114312600003','address':'الرياض'})
 s.logo({'image':Path(sys.argv[1]).read_text()})
 p=s.save_product({'name':'لحم <خاص>','unit':'kg','stock_group':'لحم','price':'80'})
 def command(action,**payload):return s.command({'action':action,'request_id':str(uuid.uuid4()),'date':datetime.date.today().isoformat(),**payload})
 command('purchase',basis='weight',weight_kg='10',stock_group='لحم',reference='PRINT-TEST',cost='300',paid='300')
 identity=command('sale',items=[{'product_id':p,'quantity':'1.125'}],cash='50',card='53.50',customer_name='عميل الاختبار',customer_phone='0500000000')
 s.logo({'image':''})
 p2=s.save_product({'name':'تقريب الوزن','unit':'kg','stock_group':'لحم','price':'1'})
 rounded=command('sale',items=[{'product_id':p2,'quantity':'1.005'}],cash='1.16',card='0')
 print(json.dumps({'invoice':s.document(identity),'rounding':s.document(rounded)},ensure_ascii=False))
`;
    const generated = spawnSync('python', ['-X', 'utf8', '-c', source, path.join(temporary, 'logo.txt')], { cwd: root, encoding: 'utf8' });
    assert.equal(generated.status, 0, generated.stderr);
    const { invoice, rounding } = JSON.parse(generated.stdout);
    assert.equal(invoice.context.issuer.logo, logo, 'Invoice snapshots the uploaded normalized logo');
    const module = { exports: {} };
    const handlers = {};
    const sandbox = { exports: module.exports, module, console, window: { qrcode: qr, addEventListener: (name, fn) => handlers[name] = fn }, document: { addEventListener: (name, fn) => handlers[name] = fn }, Intl, Date, URLSearchParams };
    const compiled = ts.transpileModule(fs.readFileSync(path.join(root, 'butcher-ui.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInNewContext(compiled, sandbox);
    const amounts = module.exports.saleLineAmounts('1.005', 100, true);
    assert.equal(amounts.net, rounding.net); assert.equal(amounts.tax, rounding.tax);
    assert.equal(amounts.net + amounts.tax, 116);
    module.exports.configureButcher({ snapshot: () => ({ role: 'owner' }) });
    const html = module.exports.butcherInvoice(invoice);
    for (const token of ['data-thermal="80"', 'data-thermal="58"', '/branda-logo.png', '0500000000', 'لحم &lt;خاص&gt;', 'ملحمة الاختبار', '<svg', '310114312600003', logo]) assert(html.includes(token), token.slice(0, 50));
    assert(!html.includes('لحم <خاص>'));
    const code = qr(0, 'M'); code.addData(invoice.context.qr_tlv); code.make();
    const scale = 8, margin = 4, count = code.getModuleCount(), width = (count + margin * 2) * scale;
    const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
    for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) if (code.isDark(row, col)) {
      for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
        const i = (((row + margin) * scale + y) * width + (col + margin) * scale + x) * 4;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
      }
    }
    const decoded = jsQR(pixels, width, width);
    assert.equal(decoded?.data, invoice.context.qr_tlv, 'Actual QR raster roundtrip');
    const bytes = Buffer.from(decoded.data, 'base64'); const tags = {};
    for (let i = 0; i < bytes.length;) { const tag = bytes[i++], length = bytes[i++]; tags[tag] = bytes.subarray(i, i + length).toString('utf8'); i += length; }
    assert.deepEqual(Object.keys(tags), ['1', '2', '3', '4', '5']);
    assert.equal(tags[1], 'ملحمة الاختبار'); assert.equal(tags[4], '103.50'); assert.equal(tags[5], '13.50');
    assert(!Number.isNaN(Date.parse(tags[3])));
    const css = fs.readFileSync(path.join(root, 'assets/butcher.css'), 'utf8');
    for (const token of ['size:80mm 297mm', 'size:58mm 297mm', 'width:74mm', 'width:54mm', '@media print', 'prefers-reduced-motion']) assert(css.includes(token));
    console.log(JSON.stringify({ result: 'passed', checks: ['normalized logo upload and invoice snapshot', 'HTML escaping and customer phone', '80/58 print actions and CSS', 'QR raster decode plus Arabic UTF-8 TLV fields'], limitations: ['No browser visual inspection', 'No physical printer test', 'No ZATCA certification or Phase 2 integration'] }));
  } finally { fs.rmSync(temporary, { recursive: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
