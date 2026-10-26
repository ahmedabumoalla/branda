const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const React=require('react');
function load(file,mocks={}){const out={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','exports',code)(n=>n in mocks?mocks[n]:n.endsWith('.css')?{__esModule:true,default:new Proxy({},{get:(_,k)=>k})}:require(n),out);return out;}
const model=load('lib/finance/shift-analytics.ts');
assert.deepEqual(model.durationParts(90061),{days:1,hours:1,minutes:1,totalMinutes:90061/60,totalHours:90061/3600,totalDays:90061/86400});
assert.equal(model.durationParts(-5).totalMinutes,0);assert.equal(model.durationParts(NaN).days,0);
const product={key:'a',productId:'a',itemId:'i',name:'قهوة',soldQuantity:10,returnedQuantity:2,netQuantity:8,salesCount:5,revenue:80,cost:30,knownProfit:50,profit:50,unknownCostLineCount:0,estimatedCostLineCount:0,legacyCostLineCount:0,tracked:true,stock:[{itemId:'i',warehouseId:'w',warehouseName:'الرئيسي',quantity:-2,unit:'حبة',minQuantity:2}]};
const report={shiftId:'6da13df7-b05c-4a3b-a47a-bb99798964ef',generatedAt:'2026-10-27T00:00:00Z',openedAt:'2026-10-25T22:58:59Z',closedAt:'2026-10-27T00:00:00Z',durationSeconds:90061,
totals:{salesCount:6,refundCount:1,grossSales:115,returnedTotal:23,netSales:92,netRevenue:80,tax:12,discount:2,cost:30,knownProfit:50,profit:null,unknownCostLineCount:1,estimatedCostLineCount:0,legacyCostLineCount:0,costCoveragePercent:50,soldQuantity:30,returnedQuantity:21,netQuantity:9,averageBasket:115/6,offlineSalesCount:1},
products:[product,{...product,key:'b',name:'شاي',soldQuantity:20,returnedQuantity:19,netQuantity:1,profit:null,unknownCostLineCount:1,stock:[]}],hourly:[{hour:5,salesCount:3,quantity:5,salesTotal:40},{hour:6,salesCount:3,quantity:4,salesTotal:52}],payments:[],notes:{}};
assert.equal(model.shiftHighlights(report).sold.key,'a','net quantity ranks after returns');
assert.equal(model.shiftHighlights(report).profitable.key,'a','unknown cost never wins profit');
assert.equal(model.shiftHighlights(report).peak.hour,6,'peak ties resolved by sales value');
assert.equal(model.shiftHighlights({...report,products:[],hourly:[]}).sold,null);
const csv=model.shiftProductsCsv([{...product,name:'=SUM(A1:A2)'},{...product,name:'قهوة "خاصة"'}]);
assert(csv.startsWith('\uFEFF'));assert(csv.includes('"\'=SUM(A1:A2)"'));assert(csv.includes('قهوة ""خاصة""'));assert(csv.includes('"50"'));
const slots=[];let cursor=0;
const hooks={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];}};
const component=load('components/finance/finance-shift-analytics.tsx',{react:hooks,'@/lib/finance/shift-analytics':model,'@/app/actions/finance-shift-analytics':{},'./finance-ui':{Numeric:({value})=>React.createElement('span',null,value)}});
const nodes=t=>Array.isArray(t)?t.flatMap(nodes):t&&typeof t==='object'?[t,...nodes(t.props?.children)]:[];
const text=t=>Array.isArray(t)?t.map(text).join(''):t&&typeof t==='object'?typeof t.type==='function'?text(t.type(t.props)):text(t.props?.children):t==null||typeof t==='boolean'?'':String(t);
const find=(tree,p)=>{const n=nodes(tree).find(p);assert(n,'control absent');return n;};
const button=(tree,label)=>find(tree,n=>n.type==='button'&&text(n).includes(label));
function render(data=report){cursor=0;return component.ShiftAnalyticsView({report:data});}
let tree=render();assert(text(tree).includes('غير مكتمل'));assert(text(tree).includes('قهوة'));assert(text(tree).includes('05:00')===false);assert(text(tree).includes('06:00'));
assert(text(tree).includes('تسويات تقييم المخزون اللاحقة'));assert.equal(nodes(tree).filter(n=>n.type==='li'&&n.props['aria-label']).length,2);
button(tree,'المخزون').props.onClick();tree=render();assert(text(tree).includes('رصيد سالب'));assert(text(tree).includes('الرئيسي'));assert(text(tree).includes('البيع بالسالب متاح'));
button(tree,'الأصناف').props.onClick();tree=render();assert.equal(nodes(tree).filter(n=>n.type==='tr').length,3);
find(tree,n=>n.type==='input').props.onChange({target:{value:'شاي'}});tree=render();assert.equal(nodes(tree).filter(n=>n.type==='tr').length,2);assert(text(tree).includes('بيانات غير مكتملة'));
find(tree,n=>n.type==='input').props.onChange({target:{value:''}});find(tree,n=>n.type==='select').props.onChange({target:{value:'profit'}});tree=render();assert(text(nodes(tree).find(n=>n.type==='tbody')).startsWith('قهوة'));
button(tree,'نظرة تحليلية').props.onClick();tree=render({...report,products:[],hourly:[],totals:{...report.totals,salesCount:0,offlineSalesCount:0,unknownCostLineCount:0,profit:0}});assert(text(tree).includes('لا توجد مبيعات صافية'));
(async()=>{
 let calls=[];let data=report;let error=null;let contexts=0;
 const access=load('lib/data/finance-shift-analytics.ts',{'server-only':{},'./brand-finance':{getBrandFinanceContext:async slug=>{contexts++;assert.equal(slug,'brand');return{cafe:{id:'authorized-brand'},client:{rpc:async(name,args)=>{calls.push({name,args});return{data,error};}}};}}});
 await assert.rejects(()=>access.getFinanceShiftAnalytics('bad','brand'));assert.equal(contexts,0,'reject invalid input before access');
 assert.equal(await access.getFinanceShiftAnalytics(report.shiftId,'brand'),report);assert.deepEqual(calls[0],{name:'brand_finance_shift_analytics',args:{p_cafe_id:'authorized-brand',p_shift_id:report.shiftId}});
 data={...report,shiftId:'other'};await assert.rejects(()=>access.getFinanceShiftAnalytics(report.shiftId,'brand'));
 data=report;error={message:'denied'};await assert.rejects(()=>access.getFinanceShiftAnalytics(report.shiftId,'brand'));
 console.log('Shift analytics: duration, net ranking, unknown cost, empty report, CSV, tabs, negative stock, search/sort and server tenant contract passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
