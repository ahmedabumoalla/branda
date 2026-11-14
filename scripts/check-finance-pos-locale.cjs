const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
function load(file, mocks={}, cache=new Map()) {
 const key=path.resolve(file);if(cache.has(key))return cache.get(key);
 const result={};cache.set(key,result);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','exports',code)(name=>{
  if(name in mocks)return mocks[name];
  if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?name.slice(2):path.resolve(path.dirname(file),name);return load(fs.existsSync(base+'.ts')?base+'.ts':base+'.tsx',mocks,cache);}
  return require(name);
 },result);return result;
}
const locale=load('lib/finance/pos-locale.ts');let checks=0;
function test(label,run){run();checks++;}
test('Exact bilingual labels preserve Arabic and whitespace',()=>{
 assert.equal(locale.financePosText('ar','إضافة إلى الطلب'),'إضافة إلى الطلب');
 assert.equal(locale.financePosText('en','إضافة إلى الطلب'),'Add to order');
 assert.equal(locale.financePosText('en',' قبل الخصم '),' Before discount ');
 assert.equal(locale.financePosText('en','اسم عميل خاص'),'اسم عميل خاص');
});
test('Product and category translations have explicit fallbacks',()=>{
 assert.equal(locale.financePosProductName({name:'اسم خاص',nameEn:'Custom product'},'en'),'Custom product');
 assert.equal(locale.financePosProductName({name:'اسم خاص',nameEn:'Custom product'},'ar'),'اسم خاص');
 assert.equal(locale.financePosProductName({name:'اسم خاص'},'en'),'اسم خاص');
 assert.equal(locale.financePosCategoryName('القهوة','en'),'Coffee');
});
test('Every bound main cashier and child-control phrase has English copy',()=>{
 for(const name of ['finance-pos','finance-pos-actions','finance-pos-fullscreen','finance-pos-offline-status','finance-touch-number-input','finance-receipt-dialog','finance-cash-handover-form','finance-shift-forms']){
  const file='components/finance/'+name+'.tsx',source=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(tree)==='t'&&ts.isStringLiteral(n.arguments[0])){const text=n.arguments[0].text;if(/[\u0600-\u06ff]/.test(text))assert.notEqual(locale.financePosText('en',text),text,`${name}: ${text}`);}ts.forEachChild(n,visit);}visit(tree);
 }
});
const previous={window:global.window,localStorage:global.localStorage};
const storage=new Map(),events=new EventTarget();let writeFails=false,readFails=false,changes=0,cleanup;
global.window=events;global.localStorage={getItem:key=>{if(readFails)throw Error('blocked');return storage.get(key)??null;},setItem:(key,value)=>{if(writeFails)throw Error('blocked');storage.set(key,value);}};
const hooks={...React,useCallback:f=>f,useSyncExternalStore:(subscribe,read,server)=>{assert.equal(server(),'ar');if(!cleanup)cleanup=subscribe(()=>changes++);return read();}};
const provider=()=>load('components/finance/finance-pos-locale.tsx',{react:hooks,'@/components/dashboard/ui/modal':{Modal:function Modal(){}}});
try{
 let module=provider();const render=()=>module.FinancePosLocaleProvider({children:null}).props.value;
 test('Arabic SSR and initial language',()=>assert.equal(render().language,'ar'));
 test('Visible switch persists English and notifies subscribers',()=>{render().setLanguage('en');assert.equal(render().language,'en');assert.equal(storage.get(locale.FINANCE_POS_LANGUAGE_KEY),'en');assert.equal(changes,1);});
 test('Fresh module restores persistent choice after reload',()=>{module=provider();assert.equal(render().language,'en');});
 test('Other tab changing to Arabic overrides remembered English',()=>{storage.set(locale.FINANCE_POS_LANGUAGE_KEY,'ar');events.dispatchEvent(new Event('storage'));assert.equal(render().language,'ar');});
 test('Write blocked but reads available still allows switching',()=>{writeFails=true;render().setLanguage('en');assert.equal(render().language,'en');assert.equal(storage.get(locale.FINANCE_POS_LANGUAGE_KEY),'ar');});
 test('Unavailable storage keeps in-memory language',()=>{readFails=true;render().setLanguage('ar');assert.equal(render().language,'ar');render().setLanguage('en');assert.equal(render().language,'en');});
}finally{cleanup?.();global.window=previous.window;global.localStorage=previous.localStorage;}
test('Cashier and dialogs scope direction without document-wide mutations',()=>{
 const source=fs.readFileSync('components/finance/finance-pos.tsx','utf8'),provider=fs.readFileSync('components/finance/finance-pos-locale.tsx','utf8');
 assert.ok(source.includes('data-pos-language-toggle'));assert.ok(source.includes('dir={dir} lang={language} data-finance-standard-pos'));
 assert.ok(source.includes('key={`${props.initialSnapshot.cafe.id}:${props.initialSnapshot.userId}`}'));
 assert.ok(source.includes('financePosCustomerNotice(saved.customer, language)'));
 assert.ok(provider.includes('closeLabel={t("إغلاق")}'));assert.ok(!provider.includes('document.documentElement'));
 assert.ok(!source.includes('nameEn: productName'));
});
console.log(`PASS POS locale ${checks} groups: phrase coverage, catalog fallbacks, persistence, storage events/failure, tenant remount and scoped direction`);
