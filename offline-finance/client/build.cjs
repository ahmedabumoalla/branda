'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),esbuild=require('../node_modules/esbuild'),ts=require('typescript');
const root=path.resolve(__dirname,'../..'),out=path.join(__dirname,'../dist/public');fs.mkdirSync(out,{recursive:true});
const shims={ 'next/navigation':'navigation.tsx','next/link':'navigation.tsx','next/image':'next-image.tsx','next/dynamic':'next-dynamic.tsx','@/lib/supabase/client':'supabase-client.ts','@/lib/finance/treasury-upload':'treasury-upload.ts','@/lib/finance/inventory-image-upload':'inventory-image-upload.ts' };
const actionModules=new Map();
function actionNames(module){const file=path.join(root,module.slice(2)+'.ts'),source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true),names=[];for(const node of source.statements){if(node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)){if(ts.isFunctionDeclaration(node)&&node.name)names.push(node.name.text);if(ts.isVariableStatement(node))for(const declaration of node.declarationList.declarations)if(ts.isIdentifier(declaration.name))names.push(declaration.name.text);}}return names;}
const plugin={name:'local-finance-boundaries',setup(build){
 build.onLoad({filter:/finance-cashier-management\.tsx$/},args=>({contents:fs.readFileSync(args.path,'utf8').replace('أضف الموظف باسمه ورقم جواله وكلمة مرور للحساب الجديد ثم يدخل إلى الكاشير برقم جواله وكلمة المرور أو رمز واتساب','أضف الموظف وحدد صلاحياته وكلمة مروره من إدارة المستخدمين على هذا الجهاز').replace('/cashier/login?type=sales','/local/users').replace('صفحة دخول موظف الكاشير','إدارة المستخدمين والصلاحيات'),loader:'tsx',resolveDir:path.dirname(args.path)}));
 build.onResolve({filter:/.*/},args=>{
  if(args.path.startsWith('/fonts/')||args.path.startsWith('/brand/'))return{path:args.path,external:true};
  if(shims[args.path])return {path:path.join(__dirname,shims[args.path])};
  if(args.path.startsWith('@/app/actions/'))return{path:args.path,namespace:'local-action'};
  if(args.path==='./use-pos-finance'&&args.importer.endsWith('finance-pos.tsx'))return{path:path.join(__dirname,'use-pos-finance.ts')};
  if(args.path==='./finance-pos-offline-status')return{path:path.join(__dirname,'pos-status.tsx')};
  if(args.path==='./finance-operation-form')return{path:path.join(__dirname,'operation-form.tsx')};
  if(args.path==='./finance-pos-actions')return{path:path.join(__dirname,'pos-actions.tsx')};
  if(args.path.startsWith('@/')){const base=path.join(root,args.path.slice(2));const found=['','.ts','.tsx','.js','/index.ts','/index.tsx'].map(suffix=>base+suffix).find(file=>fs.existsSync(file)&&fs.statSync(file).isFile());if(!found)throw Error('Missing local source '+args.path);return{path:found};}
 });
 build.onLoad({filter:/.*/,namespace:'local-action'},args=>{const names=actionNames(args.path);actionModules.set(args.path,names);return{contents:`import {invokeAction} from ${JSON.stringify(path.join(__dirname,'api.ts'))};\n`+names.map(name=>`export const ${name}=(...args)=>invokeAction(${JSON.stringify(args.path)},${JSON.stringify(name)},args);`).join('\n'),loader:'ts',resolveDir:__dirname};});
}};
(async()=>{
 const build=await esbuild.build({absWorkingDir:root,entryPoints:[path.join(__dirname,'main.tsx')],bundle:true,platform:'browser',format:'esm',splitting:true,outdir:out,entryNames:'app',chunkNames:'chunks/[name]-[hash]',assetNames:'assets/[name]-[hash]',target:['chrome120','edge120'],jsx:'automatic',minify:true,sourcemap:false,metafile:true,loader:{'.module.css':'local-css','.woff2':'file','.woff':'file','.ttf':'file','.png':'file','.svg':'file'},define:{'process.env.NODE_ENV':'"production"'},plugins:[plugin],logLevel:'warning'});
 const postcss=require('postcss'),tailwind=require('@tailwindcss/postcss');
 const tailwindInput=fs.readFileSync(path.join(root,'app/globals.css'),'utf8').replace('@import "tailwindcss";','@import "tailwindcss" source(none);')+'\n@source "../../components/finance";\n@source "../../components/dashboard/ui";\n@source "../../components/dashboard/menu";\n@source "../../components/dashboard/pages/menu-page.tsx";\n@source "../../components/ui";\n@source "./";\n';
 const css=await postcss([tailwind({base:root,optimize:true})]).process(tailwindInput,{from:path.join(__dirname,'tailwind.css')});fs.writeFileSync(path.join(out,'utilities.css'),css.css);
 const assets=['fonts/tajawal-regular.ttf','fonts/tajawal-bold.ttf','fonts/OFL.txt','brand/barndaksa-logo-brown.png','brand/barndaksa-logo-dark.png'];
 for(const asset of assets){const dest=path.join(out,asset);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,'public',asset),dest);}
 fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>برندة | المالية المحلية</title><link rel="stylesheet" href="/utilities.css"><link rel="stylesheet" href="/app.css"></head><body><div id="app"></div><script type="module" src="/app.js"></script></body></html>');
 const sourceInputs=Object.keys(build.metafile.inputs).filter(f=>!f.startsWith('local-action:')&&fs.existsSync(path.resolve(root,f))).map(f=>({file:f,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,f))).digest('hex')}));
 const record={builtAt:new Date().toISOString(),runtime:process.version,actions:[...actionModules].map(([module,names])=>({module,names})),sourceInputs,outputs:Object.keys(build.metafile.outputs)};
 fs.writeFileSync(path.join(__dirname,'build-manifest.json'),JSON.stringify(record,null,2));console.log(JSON.stringify({out,sourceFiles:sourceInputs.length,actions:record.actions.length,outputs:record.outputs.length}));
})().catch(e=>{console.error(e);process.exitCode=1});
