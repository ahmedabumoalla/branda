const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'server-only') return {};
    if (name.endsWith('.css')) return new Proxy({}, { get: (_, key) => key });
    if (name.startsWith('@/') || name.startsWith('./')) {
      const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name);
      return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx', mocks);
    }
    return require(name);
  }, exports);
  return exports;
}


(async()=>{
 const { buildFinanceThermalReceiptHtml }=load('lib/export/finance-thermal-receipt-html.ts');
 const { FinanceReceipt }=load('components/finance/finance-ui.tsx');
 const fonts={regular:fs.readFileSync('public/fonts/tajawal-regular.ttf','base64'),bold:fs.readFileSync('public/fonts/tajawal-bold.ttf','base64')};
 const r={brandName:'مقهى الاختبار',number:77,createdAt:'2026-10-27T16:00:00Z',localReference:null,subtotal:23,discount:0,tax:3,total:23,paid:23,vatRate:15,taxInclusive:true,paymentMethod:'cash',customerPhone:'0500000001',customerName:'عميل الاختبار',customerTaxNumber:'123456789',note:'بدون سكر',outstanding:0,refunded:false,refundedTotal:0,lines:[{name:'قهوة عربية',quantity:2,unitPrice:11.5,net:20,tax:3}]};
 const d={id:'receipt',number:77,kind:'sale',created_at:r.createdAt,party_id:'customer',account_id:'cash',customer_phone:r.customerPhone,subtotal:23,discount:0,tax:3,total:23,paid:23,outstanding:0,refunded:false,refunded_total:0,vat_rate:15,tax_inclusive:true,note:r.note,lines:[{id:'0',name:r.lines[0].name,quantity:2,unit_price:11.5,net:20,tax:3}]};
 const snapshot={cafe:{name:r.brandName},parties:[{id:'customer',name:r.customerName,tax_number:r.customerTaxNumber}],accounts:[{id:'cash',kind:'cash'}],documents:[]};
 const exact=renderToStaticMarkup(React.createElement(FinanceReceipt,{document:d,snapshot,brand:{name:r.brandName,logoUrl:null,color:'#3a2117'},copy:'customer'}));
 const html=buildFinanceThermalReceiptHtml(r,fonts);assert.equal(html.match(/<body>([\s\S]*)<\/body>/)[1],exact,'WhatsApp uses byte-identical customer receipt markup');
 assert(html.includes('max-width:76mm'));assert(html.includes('data:font/ttf;base64,'));assert(!html.includes('https://barndaksa.com/fonts/'));
 const attack=buildFinanceThermalReceiptHtml({...r,note:'<script>fetch("https://evil.test")</script>',lines:[{...r.lines[0],name:'<img src=x onerror=alert(1)>'}]},fonts);assert(!attack.includes('<script>'));assert(attack.includes('&lt;script&gt;'));assert(!attack.includes('<img src=x'));
 assert.throws(()=>buildFinanceThermalReceiptHtml(r,fonts,'https://evil.test/logo.png'));assert.throws(()=>buildFinanceThermalReceiptHtml(r,{regular:'bad<font',bold:fonts.bold}));
 for(const patch of [{discount:3},{paymentMethod:'pos'},{paymentMethod:'bank'},{outstanding:5,paid:18},{refunded:true,refundedTotal:23},{taxInclusive:false},{localReference:'L-77'},{customerName:null,customerPhone:null,customerTaxNumber:null}])assert(buildFinanceThermalReceiptHtml({...r,...patch},fonts).includes('data-finance-receipt'));
 const {renderFinanceThermalReceiptPdf}=load('lib/export/finance-thermal-receipt-pdf.ts');
 if(process.env.FINANCE_RECEIPT_CHROMIUM_PATH){const pdf=await renderFinanceThermalReceiptPdf(html);assert.equal(Buffer.from(pdf).subarray(0,5).toString(),'%PDF-');fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/thermal-receipt-test.pdf',pdf);const many=await renderFinanceThermalReceiptPdf(buildFinanceThermalReceiptHtml({...r,lines:Array.from({length:120},(_,i)=>({...r.lines[0],name:'صنف '+i+' '+r.lines[0].name}))},fonts));fs.writeFileSync('output/thermal-receipt-many.pdf',many);console.log('PASS actual isolated Chromium PDF rendering: ordinary and 120-line receipt');}
 console.log('PASS exact order/WhatsApp customer markup, shared thermal CSS, embedded Arabic fonts, payment/refund variants, escaped hostile copy and external-asset denial');
})().catch(e=>{console.error(e);process.exitCode=1;});
