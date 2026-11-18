import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform } from "lightningcss";
const require=createRequire(import.meta.url);
const source=fs.readFileSync("components/cashier/cashier-guide.tsx","utf8");
const css=fs.readFileSync("components/cashier/cashier-guide.module.css","utf8");
const compiled=transform({filename:"cashier-guide.module.css",code:Buffer.from(css),cssModules:true});
for(const [,name] of source.matchAll(/\bs\.(\w+)/g))assert(compiled.exports[name]);
const path="/guides/cashier-loyalty-20261118.mp4";
function harness(component,props={}){
  const states=[],refs=[],effects=[],events=[];let slot=0;
  const mocks={
    react:{...React,useId:()=>"guide-title",useState:initial=>{const index=slot++;if(!(index in states))states[index]=initial;return[states[index],next=>{states[index]=next;}];},useRef:initial=>{const ref={current:initial};refs.push(ref);return ref;},useEffect:effect=>effects.push(effect)},
    "@/lib/cashier/guide":{cashierGuidePath:path},
    "@/lib/ui/page-scroll-lock":{lockPageScroll:()=>{events.push("lock");return()=>events.push("unlock");}},
    "./cashier-language":{useCashierLanguage:()=>({t:value=>value,dir:"rtl"})},
    "./cashier-guide.module.css":{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})},
  };
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const exports={};new Function("require","exports",output)(name=>mocks[name]??require(name),exports);
  return {render(){slot=0;return exports[component](props);},effects,refs,events};
}
function nodes(tree){if(!tree||typeof tree!=="object")return[];if(Array.isArray(tree))return tree.flatMap(nodes);return[tree,...nodes(tree.props?.children)];}
const button=harness("CashierGuideButton");
const closed=renderToStaticMarkup(button.render());assert(!closed.includes("<video")&&!closed.includes(".mp4")&&!closed.includes("<dialog"));
nodes(button.render()).find(n=>n.type==="button").props.onClick();
assert(nodes(button.render()).some(n=>n.type?.name==="CashierGuideDialog"));
let closes=0;const dialog=harness("CashierGuideDialog",{close:()=>closes++});const tree=dialog.render();
const video=nodes(tree).find(n=>n.type==="video");assert.equal(video.props.src,path);assert(video.props.controls&&video.props.playsInline);assert.equal(video.props.preload,"none");assert(!video.props.autoPlay);
const external=nodes(tree).find(n=>n.type==="a");assert.equal(external.props.href,path);assert.equal(external.props.rel,"noopener noreferrer");
assert.equal(tree.props["aria-labelledby"],"guide-title");
let prevented=false;tree.props.onCancel({preventDefault(){prevented=true;}});assert(prevented);assert.equal(closes,1);
const target={};tree.props.onClick({target,currentTarget:target});assert.equal(closes,2);
tree.props.onClick({target:{},currentTarget:{}});assert.equal(closes,2);
video.props.onError();assert(nodes(dialog.render()).some(n=>n.props?.role==="alert"));
const originalDocument=globalThis.document;const events=dialog.events;
try{
  globalThis.document={activeElement:{isConnected:true,focus:()=>events.push("focus")}};
  dialog.refs[0].current={showModal:()=>events.push("show"),close:()=>events.push("close")};
  dialog.refs[1].current={pause:()=>events.push("pause")};
  const cleanup=dialog.effects[0]();assert.deepEqual(events,["show","lock"]);cleanup();assert.deepEqual(events,["show","lock","pause","close","unlock","focus"]);
}finally{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;}
assert(fs.existsSync("public"+path));
console.log("PASS cashier guide: lazy media, native controls, focus/scroll restoration, pause on close, Escape/backdrop and error fallback; no browser or messages");
