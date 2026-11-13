import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url),folder=path.resolve('.codex-tmp/erp-store-tests');fs.mkdirSync(folder,{recursive:true});
for(const file of ['store','store-render']){fs.writeFileSync(path.join(folder,file+'.cjs'),ts.transpileModule(fs.readFileSync('lib/erp/'+file+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);}
const store=require(path.join(folder,'store.cjs')),render=require(path.join(folder,'store-render.cjs'));
let checks=0;function check(value,message){assert.ok(value,message);checks++;}
for(const type of store.storeBlockTypes){const b=store.newStoreBlock(type);check(store.storeBlockSchema.safeParse(b).success,'valid '+type);check(typeof render.storeBlockHtml(b,[])==='string','render '+type);}
const block=store.newStoreBlock('text');block.text='<script>alert(1)</script>';check(!render.storeBlockHtml(block,[]).includes('<script>'),'text cannot inject markup');
block.href='javascript:alert(1)';check(!store.storeBlockSchema.safeParse(block).success,'javascript forbidden');block.href='//example.test';check(!store.storeBlockSchema.safeParse(block).success,'protocol relative forbidden');block.href='/';check(store.storeBlockSchema.safeParse(block).success,'root path allowed');
const item={id:crypto.randomUUID(),title:'رابط',type:'link',target:'https://example.test',parentId:null};check(store.storeMenuSchema.safeParse({items:[item]}).success,'valid menu');check(!store.storeMenuSchema.safeParse({items:[{...item,parentId:item.id}]}).success,'self cycle denied');const other={...item,id:crypto.randomUUID(),parentId:item.id};check(!store.storeMenuSchema.safeParse({items:[{...item,parentId:other.id},other]}).success,'two node cycle denied');check(!store.storeMenuSchema.safeParse({items:[item,item]}).success,'duplicate ids denied');
const child=store.newStoreBlock('column');let cursor=child;for(let i=0;i<10;i++){const next=store.newStoreBlock('column');cursor.children=[next];cursor=next;}check(!store.storePageSchema.safeParse({kind:'page',blocks:[child]}).success,'deep recursion bounded');
assert.deepEqual(store.moveStoreItem(['a','b','c'],1,-1),['b','a','c']);checks++;assert.deepEqual(store.moveStoreItem(['a','b'],0,-1),['a','b']);checks++;
const zip=render.storeZip([{name:'index.html',text:'صفحة عربية'},{name:'styles.css',text:'body{}'}]);check(new DataView(zip.buffer).getUint32(0,true)===0x04034b50,'ZIP local header');check(new DataView(zip.buffer).getUint32(zip.length-22,true)===0x06054b50,'ZIP end header');const JSZip=require('jszip'),read=await JSZip.loadAsync(zip);check(await read.file('index.html').async('string')==='صفحة عربية','ZIP UTF-8 round trip');
const binary=new Uint8Array([0,255,128,13,10]);const archive=await JSZip.loadAsync(render.storeZip([{name:'images/test.webp',data:binary}]));assert.deepEqual(await archive.file('images/test.webp').async('uint8array'),binary);checks++;
const {parseDocument}=require('htmlparser2');
const nodes=root=>[root,...(root.children??[]).flatMap(nodes)];
const radio={...store.newStoreBlock('radio'),name:'choice',text:'طريقة التواصل',required:true,options:['البريد','"<خيار>&']};
const radioHtml=render.storeBlockHtml(radio,[]),radioNodes=nodes(parseDocument(radioHtml));
check(radioNodes.some(n=>n.name==='fieldset')&&radioNodes.some(n=>n.name==='legend'),'radio group has accessible fieldset and legend');
const radios=radioNodes.filter(n=>n.name==='input');assert.deepEqual(radios.map(n=>n.attribs.value),radio.options);checks++;
check(radios.every(n=>n.attribs.name==='choice'&&n.attribs.type==='radio'&&'required' in n.attribs),'radio group retains shared name, option values and required state');
check(!radioHtml.includes('<خيار>'),'radio option escapes markup and attributes');
check(radios.every(n=>n.parent.name==='label'),'every radio option has associated label');
const select={...store.newStoreBlock('select'),name:'service',required:true,options:['خدمة أولى','خدمة ثانية']};
const selectNodes=nodes(parseDocument(render.storeBlockHtml(select,[]))),options=selectNodes.filter(n=>n.name==='option');
check(options[0].attribs.value==='','required select starts with empty choice instead of selecting first service silently');
assert.deepEqual(options.slice(1).map(n=>n.attribs.value),select.options);checks++;
const checkbox={...store.newStoreBlock('checkbox'),name:'consent',required:true},checkboxNode=nodes(parseDocument(render.storeBlockHtml(checkbox,[]))).find(n=>n.name==='input');
check(checkboxNode.attribs.name==='consent'&&checkboxNode.attribs.type==='checkbox'&&'required' in checkboxNode.attribs,'checkbox retains native consent semantics');
for(const type of ['input','textarea']){const field=nodes(parseDocument(render.storeBlockHtml(store.newStoreBlock(type),[]))).find(n=>n.name===(type==='input'?'input':'textarea'));check(field.attribs.maxlength==='2000','export matches public field value limit '+type);}
const page=render.storePageHtml('نموذج',[{...store.newStoreBlock('form'),children:[radio,select,checkbox]}],[]),formArchive=await JSZip.loadAsync(render.storeZip([{name:'index.html',text:page},{name:'styles.css',text:render.storePageCss}]));
check(await formArchive.file('index.html').async('string')===page,'ZIP export retains complete form controls');
const React=require('react');let hook=0,changedBlocks=null;
const builderExports={},builderCode=ts.transpileModule(fs.readFileSync('components/erp/store/store-builder.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
new Function('require','exports',builderCode)(name=>name==='react'?{...React,useEffect(){},useRef:value=>({current:value}),useState:value=>{const index=hook++;return [index===0?radio.id:index===3?'traits':typeof value==='function'?value():value,()=>{}];}}:name==='@/lib/erp/store'?store:name==='@/lib/erp/store-render'?render:name.endsWith('.css')?new Proxy({},{get:(_,key)=>key}):require(name),builderExports);
const elements=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(elements):[node,...elements(node.props?.children)];
const builderElements=elements(builderExports.StoreBuilder({value:[radio],assets:[],title:'نموذج',onChange:value=>{changedBlocks=value;}}));
const optionEditor=builderElements.find(n=>n.type==='textarea'&&n.props.value===radio.options.join('\n'));
check(!!optionEditor,'radio options editable through actual properties panel');optionEditor.props.onChange({target:{value:'خيار جديد\nخيار آخر'}});
assert.deepEqual(changedBlocks[0].options,['خيار جديد','خيار آخر']);checks++;
assert.deepEqual(builderElements.filter(n=>n.type==='input'&&n.props.type==='radio').map(n=>n.props.value),radio.options);checks++;
hook=0;changedBlocks=null;const readOnlyElements=elements(builderExports.StoreBuilder({value:[radio],assets:[],title:'نموذج',readOnly:true,onChange:value=>{changedBlocks=value;}}));
readOnlyElements.find(n=>n.type==='textarea'&&n.props.value===radio.options.join('\n')).props.onChange({target:{value:'غير مسموح'}});check(changedBlocks===null,'read-only editor still rejects changes');
const result={passed:true,checks,at:new Date().toISOString(),runtime:process.version,scope:'Store schema/rendering and actual HTML/ZIP radio/select/checkbox semantics; no browser/network',inputs:Object.fromEntries(['lib/erp/store.ts','lib/erp/store-render.ts','components/erp/store/store-builder.tsx','scripts/check-erp-store.mjs','package.json','package-lock.json'].map(file=>[file,require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex')]))};
fs.writeFileSync('output/integrated-system/erp-store-form-export-verification.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:true,checks}));
