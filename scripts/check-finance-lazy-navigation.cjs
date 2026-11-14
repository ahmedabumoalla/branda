const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');

// Exercise component output and event handlers without a browser or a live account.
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return new Proxy({}, { get: (_, key) => key });
    if (name.startsWith('@/') || name.startsWith('./')) {
      const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name);
      return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx', mocks);
    }
    return require(name);
  }, exports);
  return exports;
}

const children=new Proxy({}, {get:(_,n)=>Object.defineProperty(function Child(){},'name',{value:n})});
let url=new URL('https://example.test/dashboard/finance?section=sales'),writes=0,lazy=0;
const data={cafe:{id:'fixture',name:'Fixture',slug:'brand'},userId:'admin',role:'owner',canManage:true,canAdminister:true,settings:{currency:'SAR'},products:[],items:[],accounts:[],warehouses:[],parties:[],staff:[],shifts:[],documents:[],journal:[],movements:[],stock:[],trialBalance:[],summary:{}};
const mocks={react:{...React,useRef:v=>({current:v}),useState:v=>[typeof v==='function'?v():v,()=>{}]},'next/navigation':{useSearchParams:()=>url.searchParams},'next/link':{__esModule:true,default:children.Link},'next/dynamic':{__esModule:true,default:f=>{lazy++;const n=f.toString().match(/module\.(Finance\w+)/)?.[1];assert.ok(n);return children[n];}},'./use-finance':{useFinance:()=>({snapshot:data,pending:false,error:'',message:'',historyMore:{},execute(){writes++},refresh(){writes++},clearFeedback(){}})},'@/lib/finance/ledger':{ledgerPilotEnabled:()=>false},'./finance-ui':{...children,Panel:children.Panel,Empty:children.Empty,Metric:children.Metric,Numeric:children.Numeric,documentKindNames:{},financeDate:v=>v,financeDocumentStatus:()=>'',downloadFinanceCsv(){}}};
const source=fs.readFileSync('components/finance/finance-workspace.tsx','utf8');
for(const match of source.matchAll(/from "([^"]+)"/g)){const n=match[1];if((n.startsWith('./')||n.startsWith('@/app/actions/')||n.startsWith('@/components/'))&&!n.includes('navigation')&&!(n in mocks))mocks[n]=children;}
const {FinanceWorkspace}=load('components/finance/finance-workspace.tsx',mocks);
function nodes(t){if(!t||typeof t!=='object')return[];if(Array.isArray(t))return t.flatMap(nodes);return[t,...nodes(t.props?.children)];}
let count=0;
for(const [view,name] of [['create','FinanceSaleForm'],['sales-settings','FinanceSalesSettings'],['quotes','FinanceQuotes'],['credit-notes','FinanceCreditNotes'],['recurring','FinanceRecurringInvoices']]){url.search='?section=sales&view='+view;const tree=FinanceWorkspace({initialSnapshot:data});assert.ok(nodes(tree).some(n=>n.type?.name===name),view);count++;}
assert.equal(writes,0);assert.equal(lazy,12);count+=2;
url.search='?section=sales';const tree=FinanceWorkspace({initialSnapshot:data});const invoices=nodes(tree).find(n=>n.type?.name==='FinanceInvoices');assert.equal(typeof invoices.props.onImport,'function');count++;
data.role='auditor';data.canAdminister=false;const readonly=nodes(FinanceWorkspace({initialSnapshot:data})).find(n=>n.type?.name==='FinanceInvoices');assert.equal(readonly.props.onImport,undefined);count++;
console.log('PASS '+count+' lazy navigation/import permission checks; zero data loads/mutations across visited views');
