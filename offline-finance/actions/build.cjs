'use strict';
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const esbuild=require('../node_modules/esbuild');
const root=path.resolve(__dirname,'../..'),out=path.join(__dirname,'dist');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'offline-finance/client/action-manifest.json'),'utf8'));
const entry=path.join(__dirname,'generated.ts');
const registryRows=[];
const imports=manifest.modules.map((m,i)=>{registryRows.push(`${JSON.stringify(m.module)}: {${m.names.map(n=>`${JSON.stringify(n)}: a${i}.${n}`).join(',')}}`);return `import * as a${i} from ${JSON.stringify(path.relative(__dirname,path.join(root,m.file)).replace(/\\/g,'/').replace(/\.tsx?$/,''))};`;});
const routes=['receipt-brand','company-invoices/[id]/pdf','inventory-image','media','shift-attachments','shift-attachments/[id]','treasury-attachments','treasury-attachments/[id]'];
const routeImports=routes.map((route,i)=>`import * as r${i} from ${JSON.stringify(path.relative(__dirname,path.join(root,'app/api/finance/[slug]',route,'route')).replace(/\\/g,'/'))};`);
fs.writeFileSync(entry,`import { runInContext, type ActionContext } from './context';\n${imports.join('\n')}\n${routeImports.join('\n')}\nconst registry: Record<string,Record<string,(...args:any[])=>any>> = {${registryRows.join(',')}};\nconst routeRegistry: Record<string,Record<string,any>>={${routes.map((route,i)=>`${JSON.stringify(route)}:r${i}`).join(',')}};\nexport const getActionNames=()=>Object.fromEntries(Object.entries(registry).map(([m,a])=>[m,Object.keys(a)]));\nexport async function executeAction(context: ActionContext,module:string,name:string,args:unknown[]) { if(!Object.hasOwn(registry,module)||!Object.hasOwn(registry[module],name)||!Array.isArray(args))throw new Error('Unknown local finance action');return runInContext(context,()=>registry[module][name](...args));}\nexport async function executeRoute(context:ActionContext,path:string,request:Request):Promise<Response>{const parts=path.split('/').filter(Boolean);if(parts[0]!=='api'||parts[1]!=='finance'||decodeURIComponent(parts[2]||'')!==context.cafe.slug)return new Response(null,{status:404});const tail=parts.slice(3);let id='';if(tail.length>1){id=tail[1];tail[1]='[id]';}const route=routeRegistry[tail.join('/')],handler=route?.[request.method];if(typeof handler!=='function')return new Response(null,{status:404});return runInContext(context,()=>handler(request,{params:Promise.resolve({slug:context.cafe.slug,id})}));}\n`);
const platform=new Set(['next/cache','next/server','next/headers','next/navigation','@/lib/auth/active-user','@/lib/data/cafes','@/lib/platform/maintenance','@/lib/erp/request-context','@/lib/data/owner-service-access']);
const replacements=new Map([['@/lib/supabase/server','supabase.ts'],['@/lib/supabase/admin','supabase.ts'],['@supabase/supabase-js','supabase.ts'],['@supabase/ssr','supabase.ts'],['@/lib/data/finance-access','access.ts']]);
const blockedPrefixes=['@/lib/whatsapp/','@/lib/email/','@/lib/pager/worker','@/lib/data/finance-pos-customer-messages','@/lib/data/finance-shift-alerts','@/lib/finance/invoice-import-ai','@/lib/data/menu-imports','@/lib/export/finance-thermal-receipt-pdf'];
function namedExports(file){const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);const names=new Set();for(const statement of source.statements){const exported=statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);if(exported&&statement.name)names.add(statement.name.text);if(exported&&ts.isVariableStatement(statement))for(const d of statement.declarationList.declarations)if(ts.isIdentifier(d.name))names.add(d.name.text);if(ts.isExportDeclaration(statement)&&statement.exportClause&&ts.isNamedExports(statement.exportClause))for(const e of statement.exportClause.elements)names.add(e.name.text);}return [...names];}
const blocked=[];
fs.mkdirSync(out,{recursive:true});
esbuild.build({entryPoints:[entry],outfile:path.join(out,'actions.cjs'),bundle:true,platform:'node',format:'cjs',target:'node24',metafile:true,logLevel:'warning',nodePaths:[path.join(root,'node_modules')],external:['sharp','@sparticuz/chromium','puppeteer-core'],plugins:[{name:'offline-finance-server-boundaries',setup(build){
build.onResolve({filter:/.*/},args=>{
 if(args.path==='server-only')return{path:'empty',namespace:'local-empty'};
 if(platform.has(args.path))return{path:path.join(__dirname,'platform.ts')};
 if(replacements.has(args.path))return{path:path.join(__dirname,replacements.get(args.path))};
 if(blockedPrefixes.some(prefix=>args.path.startsWith(prefix))){const file=path.join(root,args.path.slice(2)+'.ts');blocked.push(args.path);return{path:file,namespace:'offline-only'};}
 if(args.path.startsWith('@/')){let p=path.join(root,args.path.slice(2));for(const ext of ['.ts','.tsx','.mjs','.js','/index.ts'])if(fs.existsSync(p+ext))return{path:p+ext};}
});
build.onLoad({filter:/.*/,namespace:'local-empty'},()=>({contents:'export {};',loader:'js'}));
// Retain the original upload validation/path logic; replace only hosted client bootstrap.
build.onLoad({filter:/[\\/]lib[\\/]storage[\\/]upload-server\.ts$/},args=>({loader:'ts',contents:fs.readFileSync(args.path,'utf8').replace(/function createStorageAdminClient\(\) \{[\s\S]*?\n\}/,'function createStorageAdminClient() { return createSupabaseAdminClient("local", "local"); }')}));
build.onLoad({filter:/.*/,namespace:'offline-only'},args=>({loader:'js',contents:namedExports(args.path).map(name=>{
 if(/(?:Error|Exception)$/.test(name))return `export class ${name} extends Error {}`;
 if(/^(is.*Configured|has.*Configured)$/.test(name))return `export function ${name}(){return false;}`;
 return `export function ${name}(){throw new Error('هذه الخدمة تتطلب اتصالًا بالإنترنت وهي غير متاحة في النسخة المحلية');}`;
}).join('\n')}));
}}]}).then(result=>{fs.writeFileSync(path.join(out,'metafile.json'),JSON.stringify(result.metafile,null,2));fs.writeFileSync(path.join(out,'boundaries.json'),JSON.stringify({actions:manifest.modules.map(m=>({module:m.module,names:m.names})),offlineUnavailable:[...new Set(blocked)]},null,2));console.log(JSON.stringify({modules:manifest.modules.length,actions:manifest.modules.reduce((n,m)=>n+m.names.length,0),blocked:[...new Set(blocked)].length,bytes:fs.statSync(path.join(out,'actions.cjs')).size}));}).catch(()=>process.exitCode=1);
