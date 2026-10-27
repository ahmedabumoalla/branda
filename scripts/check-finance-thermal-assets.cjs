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
 let logoUrl=null, captured,fetches=[];const sharp=require('sharp');const png=await sharp({create:{width:2,height:2,channels:4,background:'#fff'}}).png().toBuffer();
 const receipt={cafeId:'11111111-1111-4111-8111-111111111111',brandName:'Brand'};
 const savedFetch=global.fetch;process.env.NEXT_PUBLIC_SUPABASE_URL='https://project.supabase.co';
 global.fetch=async(url,options)=>{fetches.push({url:String(url),options});return new Response(png,{headers:{'content-type':'image/png'}})};
 const worker=load('lib/data/finance-customer-receipt.ts',{
 './finance-receipt-brand':{getFinanceReceiptBrandForCafe:async cafe=>{assert.equal(cafe.id,receipt.cafeId);return {logoUrl}}},
 '@/lib/export/finance-thermal-receipt-html':{buildFinanceThermalReceiptHtml:(r,fonts,logo)=>{assert.equal(r,receipt);assert(fonts.regular&&fonts.bold);captured=logo;return 'safe-html'}},
 '@/lib/export/finance-thermal-receipt-pdf':{renderFinanceThermalReceiptPdf:async html=>{assert.equal(html,'safe-html');return Buffer.from('%PDF-test')}}});
 try{
 logoUrl='data:image/png;base64,'+png.toString('base64');await worker.createFinanceCustomerReceiptPdf(receipt);assert(captured.startsWith('data:image/png;base64,'));assert.equal(fetches.length,0);
 logoUrl='https://project.supabase.co/storage/v1/object/sign/cafe-logos/tenant/logo.png?token=secret';await worker.createFinanceCustomerReceiptPdf(receipt);assert(captured);assert.equal(fetches.length,1);assert.equal(fetches[0].options.redirect,'error');
 logoUrl='/menu-logos/logo.webp';await worker.createFinanceCustomerReceiptPdf(receipt);assert.equal(fetches.at(-1).url,'https://barndaksa.com/menu-logos/logo.webp');
 for(const blocked of ['https://evil.test/logo.png','http://169.254.169.254/metadata','/api/private','https://project.supabase.co/rest/v1/cafes']){logoUrl=blocked;const before=fetches.length;await worker.createFinanceCustomerReceiptPdf(receipt);assert.equal(fetches.length,before);assert.equal(captured,null);}
 logoUrl='https://project.supabase.co/storage/v1/object/sign/cafe-logos/logo.png';global.fetch=async()=>new Response(new Uint8Array(3_000_001));await worker.createFinanceCustomerReceiptPdf(receipt);assert.equal(captured,null);
 }finally{global.fetch=savedFetch;}
 console.log('PASS thermal logo: trusted tenant identity, raster re-encoding, no redirects, no arbitrary origins/routes, bounded streamed bytes, print-compatible missing-logo fallback');
})().catch(e=>{console.error(e);process.exitCode=1});
