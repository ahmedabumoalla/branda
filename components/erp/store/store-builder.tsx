"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Code, Columns3, Copy, Download, Eye, Layers, Maximize, Monitor, Paintbrush, Plus, Redo2, Settings2, Smartphone, Trash2, Undo2 } from "lucide-react";
import { moveStoreItem, newStoreBlock, storeBlockLabels, storeBlockTypes, type StoreAsset, type StoreBlock, type StoreBlockType } from "@/lib/erp/store";
import { storeBlockHtml, storePageCss, storePageHtml, storeZip } from "@/lib/erp/store-render";
import styles from "./store.module.css";

function updateTree(nodes:StoreBlock[],id:string,edit:(b:StoreBlock)=>StoreBlock|null):StoreBlock[]{return nodes.flatMap(b=>{if(b.id===id){const next=edit(b);return next?[next]:[];}return[{...b,children:updateTree(b.children,id,edit)}];});}
function findBlock(nodes:StoreBlock[],id:string):StoreBlock|undefined {for(const b of nodes){if(b.id===id)return b;const found=findBlock(b.children,id);if(found)return found;}}
function reorder(nodes:StoreBlock[],id:string,direction:number):StoreBlock[]{const i=nodes.findIndex(b=>b.id===id);return i>=0?moveStoreItem(nodes,i,direction):nodes.map(b=>({...b,children:reorder(b.children,id,direction)}));}
function cloneBlock(b:StoreBlock):StoreBlock{return {...b,id:crypto.randomUUID(),children:b.children.map(cloneBlock)};}
export function downloadStoreFile(name:string,data:BlobPart,type:string){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export function StoreBuilder({value,onChange,assets,title,readOnly=false}:{value:StoreBlock[];onChange:(v:StoreBlock[])=>void;assets:StoreAsset[];title:string;readOnly?:boolean}) {
  const [selection,setSelection]=useState("");const [exporting,setExporting]=useState(false),[exportError,setExportError]=useState("");const exportLock=useRef(false);const [panel,setPanel]=useState<"blocks"|"style"|"traits"|"layers"|"code">("blocks");const [preview,setPreview]=useState(false),[mobile,setMobile]=useState(false),[full,setFull]=useState(false);const undo=useRef<StoreBlock[][]>([]),redo=useRef<StoreBlock[][]>([]);const [historySize,setHistorySize]=useState({undo:0,redo:0});
  const selected=findBlock(value,selection);const containers=["column","columns2","columns3","columns37","form","linkBlock","textSection","navbar"];
  function commit(next:StoreBlock[]){if(readOnly)return;undo.current.push(value);if(undo.current.length>100)undo.current.shift();redo.current=[];onChange(next);setHistorySize({undo:undo.current.length,redo:redo.current.length});}
  function edit(patch:Partial<StoreBlock>){if(selected)commit(updateTree(value,selected.id,b=>({...b,...patch})));}
  function add(type:StoreBlockType,parentId?:string){const block=newStoreBlock(type);commit(parentId?updateTree(value,parentId,b=>({...b,children:[...b.children,block]})):[...value,block]);setSelection(block.id);}
  function receiveDrop(event:React.DragEvent,parentId?:string){
    event.preventDefault();event.stopPropagation();if(readOnly||preview)return;
    const existing=event.dataTransfer.getData("application/x-branda-existing"),block=existing?findBlock(value,existing):undefined;
    if(block){if(parentId&&(parentId===block.id||findBlock(block.children,parentId)))return;const without=updateTree(value,block.id,()=>null);commit(parentId?updateTree(without,parentId,b=>({...b,children:[...b.children,block]})):[...without,block]);setSelection(block.id);return;}
    const type=event.dataTransfer.getData("application/x-branda-block") as StoreBlockType;if(storeBlockTypes.includes(type))add(type,parentId);
  }
  function remove(){if(selected){commit(updateTree(value,selected.id,()=>null));setSelection("");}}
  function history(direction:"undo"|"redo"){const source=direction==="undo"?undo:redo,target=direction==="undo"?redo:undo;const next=source.current.pop();if(next){target.current.push(value);onChange(next);setHistorySize({undo:undo.current.length,redo:redo.current.length});}}
  useEffect(()=>{if(!full)return;const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")setFull(false);};document.addEventListener("keydown",onKey);return()=>document.removeEventListener("keydown",onKey);},[full]);
  async function exportPage(){
    if(exportLock.current)return;exportLock.current=true;setExporting(true);setExportError("");
    try{
      const used=new Set<string>();const visit=(blocks:StoreBlock[])=>blocks.forEach(b=>{if(b.type==="image"&&b.assetId)used.add(b.assetId);visit(b.children);});visit(value);
      const files:({name:string;text:string}|{name:string;data:Uint8Array})[]=[],local:StoreAsset[]=[];let total=0;
      for(const id of used){const asset=assets.find(a=>a.id===id);if(!asset?.url)throw new Error("تعذر تحميل صورة الصفحة أعد فتحها ثم حاول مجددًا");const response=await fetch(asset.url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error("انتهت صلاحية معاينة الصورة أعد فتح الصفحة قبل التصدير");const bytes=new Uint8Array(await response.arrayBuffer());total+=bytes.length;if(total>100*1024*1024)throw new Error("صور الصفحة تتجاوز حجم التصدير المسموح مئة ميغابايت");const name=`images/${asset.id}.webp`;files.push({name,data:bytes});local.push({...asset,url:name});}
      files.unshift({name:"index.html",text:storePageHtml(title,value,local)},{name:"styles.css",text:storePageCss});
      downloadStoreFile("store-page.zip",new Uint8Array(storeZip(files)).buffer,"application/zip");
    }catch(reason){setExportError(reason instanceof Error?reason.message:"تعذر تصدير الصفحة أعد المحاولة");}finally{exportLock.current=false;setExporting(false);}
  }
  function blockView(b:StoreBlock):React.ReactNode {
    const a=assets.find(x=>x.id===b.assetId),children=b.children.map(blockView),s=b.style;let body:React.ReactNode=b.text;
    if(b.type==="image")body=a?.url?<Image unoptimized width={1200} height={800} src={a.url} alt={b.alt||a.alt}/>:<span>اختر صورة من الخصائص</span>;
    if(b.type==="video")body=<video controls src={b.href||undefined} style={{maxWidth:"100%"}}/>;
    if(b.type==="map")body=<span>⌖ {b.text||"الخريطة"}</span>;
    if(b.type==="countdown")body=<Countdown deadline={b.deadline}/>;
    if(["input","textarea","select","checkbox"].includes(b.type))body=<label>{b.text}{b.type==="textarea"?<textarea readOnly/>:b.type==="select"?<select disabled>{b.options.map((o,i)=><option key={i}>{o}</option>)}</select>:<input readOnly type={b.type==="input"?"text":b.type}/>}</label>;
    if(b.type==="radio")body=<fieldset><legend>{b.text}</legend>{b.options.map((option,index)=><label key={index}><input disabled type="radio" name={b.name||b.id} value={option}/>{option}</label>)}</fieldset>;
    if(b.type==="button")body=<span className={styles.button}>{b.text}</span>;
    if(containers.includes(b.type)&&b.type!=="textSection")body=null;
    const columns=b.type==="columns2"?"repeat(2,minmax(0,1fr))":b.type==="columns3"?"repeat(3,minmax(0,1fr))":b.type==="columns37"?"3fr 7fr":undefined;
    return <div key={b.id} role="treeitem" draggable={!readOnly&&!preview} onDragStart={e=>{e.stopPropagation();e.dataTransfer.setData("application/x-branda-existing",b.id);}} tabIndex={preview?-1:0} aria-selected={!preview&&selection===b.id} aria-label={storeBlockLabels[b.type]} className={styles.canvasBlock} style={{color:s.color,background:s.background,fontSize:s.fontSize,padding:s.padding,textAlign:s.align,width:`${s.width}%`}}
      onClick={e=>{if(!preview){e.stopPropagation();setSelection(b.id);}}} onKeyDown={e=>{if(e.key==="Enter"&&!preview){e.stopPropagation();setSelection(b.id);}}}
      onDragOver={e=>{if(!readOnly&&!preview&&containers.includes(b.type)){e.preventDefault();e.stopPropagation();}}} onDrop={e=>{if(containers.includes(b.type))receiveDrop(e,b.id);}}>
      {body}<div style={{display:columns?"grid":undefined,gridTemplateColumns:columns,gap:8}}>{children}</div>{!preview&&containers.includes(b.type)&&!b.children.length&&<div className={styles.dropHint}>أفلت العناصر هنا أو اختر إضافة داخل العنصر</div>}
    </div>;
  }
  function layer(nodes:StoreBlock[],depth=0):React.ReactNode{return nodes.map(b=><div key={b.id}><div className={styles.layer} style={{paddingInlineStart:depth*12}}><button type="button" onClick={()=>setSelection(b.id)} aria-pressed={b.id===selection}>{storeBlockLabels[b.type]}</button><button type="button" disabled={readOnly} onClick={()=>commit(reorder(value,b.id,-1))} aria-label="تحريك لأعلى"><ArrowUp size={13}/></button><button type="button" disabled={readOnly} onClick={()=>commit(reorder(value,b.id,1))} aria-label="تحريك لأسفل"><ArrowDown size={13}/></button></div>{layer(b.children,depth+1)}</div>);}
  const html=panel==="code"?storePageHtml(title,value,assets):"";
  return <div className={`${styles.editor} ${full?styles.fullScreen:""}`}>
    <div className={styles.editorTools} role="toolbar" aria-label="أدوات تصميم الصفحة">
      {([["style",Paintbrush,"الأنماط"],["traits",Settings2,"الخصائص"],["layers",Layers,"الطبقات"],["blocks",Columns3,"العناصر"],["code",Code,"عرض الكود"]] as const).map(([id,Icon,label])=><button key={id} type="button" aria-label={label} title={label} aria-pressed={panel===id} onClick={()=>setPanel(id)}><Icon size={18}/></button>)}
      <button type="button" title="عرض الهاتف" aria-label="عرض الهاتف" aria-pressed={mobile} onClick={()=>setMobile(!mobile)}>{mobile?<Monitor size={18}/>:<Smartphone size={18}/>}</button>
      <button type="button" title="معاينة" aria-label="معاينة" aria-pressed={preview} onClick={()=>setPreview(!preview)}><Eye size={18}/></button>
      <button type="button" title="ملء الشاشة" aria-label="ملء الشاشة" aria-pressed={full} onClick={()=>setFull(!full)}><Maximize size={18}/></button>
      <button type="button" title="تراجع" aria-label="تراجع" disabled={readOnly||!historySize.undo} onClick={()=>history("undo")}><Undo2 size={18}/></button>
      <button type="button" title="إعادة" aria-label="إعادة" disabled={readOnly||!historySize.redo} onClick={()=>history("redo")}><Redo2 size={18}/></button>
      <button type="button" title="نسخ العنصر" aria-label="نسخ العنصر" disabled={readOnly||!selected} onClick={()=>{if(selected)commit([...value,cloneBlock(selected)]);}}><Copy size={18}/></button>
      <button type="button" title="حذف العنصر" aria-label="حذف العنصر" disabled={readOnly||!selected} onClick={remove}><Trash2 size={18}/></button>
      <button type="button" title="تصدير ملف مضغوط" aria-label="تصدير ملف مضغوط" disabled={exporting} onClick={()=>void exportPage()}><Download size={18}/></button>
    </div>
    {exportError&&<p role="alert">{exportError}</p>}{exporting&&<p role="status">جار تجهيز الصفحة والصور للتنزيل</p>}
    <div className={styles.editorMain}><aside className={styles.editorSide}>
      {panel==="blocks"&&<><h3>العناصر الأساسية</h3><div className={styles.blocks}>{storeBlockTypes.map(type=><button className={styles.blockTile} key={type} type="button" draggable={!readOnly} disabled={readOnly} onDragStart={e=>e.dataTransfer.setData("application/x-branda-block",type)} onClick={()=>add(type)}><Plus size={20}/>{storeBlockLabels[type]}</button>)}</div>{selected&&containers.includes(selected.type)&&<><h3>إضافة داخل العنصر المحدد</h3><select aria-label="نوع العنصر الداخلي" value="" disabled={readOnly} onChange={e=>{if(e.target.value)add(e.target.value as StoreBlockType,selected.id);}}><option value="">اختر عنصرًا</option>{storeBlockTypes.map(type=><option key={type} value={type}>{storeBlockLabels[type]}</option>)}</select></>}</>}
      {panel==="layers"&&<><h3>الطبقات</h3>{layer(value)}</>}
      {(panel==="style"||panel==="traits")&&!selected&&<p>حدد عنصرًا من الصفحة لتحرير خصائصه</p>}
      {panel==="style"&&selected&&<fieldset disabled={readOnly}><legend>أنماط العنصر</legend><label>لون النص<input type="color" value={selected.style.color} onChange={e=>edit({style:{...selected.style,color:e.target.value}})}/></label><label>لون الخلفية<input type="color" value={selected.style.background} onChange={e=>edit({style:{...selected.style,background:e.target.value}})}/></label>{([['fontSize','حجم الخط',10,96],['padding','المسافة الداخلية',0,120],['width','العرض بالنسبة المئوية',10,100]] as const).map(([key,label,min,max])=><label key={key}>{label}<input type="number" min={min} max={max} value={selected.style[key]} onChange={e=>edit({style:{...selected.style,[key]:Math.max(min,Math.min(max,Number(e.target.value)))}})}/></label>)}<label>المحاذاة<select value={selected.style.align} onChange={e=>edit({style:{...selected.style,align:e.target.value as "start"|"center"|"end"}})}><option value="start">البداية</option><option value="center">الوسط</option><option value="end">النهاية</option></select></label></fieldset>}
      {panel==="traits"&&selected&&<fieldset disabled={readOnly}><legend>خصائص العنصر</legend><label>النص<textarea value={selected.text} onChange={e=>edit({text:e.target.value})}/></label>{["link","linkBlock","navbar","map","video"].includes(selected.type)&&<label>الرابط<input dir="ltr" value={selected.href} onChange={e=>edit({href:e.target.value})}/></label>}{selected.type==="image"&&<><label>الصورة<select value={selected.assetId} onChange={e=>edit({assetId:e.target.value})}><option value="">اختر صورة</option>{assets.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>النص البديل<input value={selected.alt} onChange={e=>edit({alt:e.target.value})}/></label></>}{["input","textarea","select","checkbox","radio","label"].includes(selected.type)&&<><label>اسم الحقل<input value={selected.name} onChange={e=>edit({name:e.target.value})}/></label><label><input type="checkbox" checked={selected.required} onChange={e=>edit({required:e.target.checked})}/>مطلوب</label></>}{["select","radio"].includes(selected.type)&&<label>الخيارات كل خيار في سطر<textarea value={selected.options.join("\n")} onChange={e=>edit({options:e.target.value.split("\n")})}/></label>}{selected.type==="countdown"&&<label>الموعد<input type="datetime-local" value={selected.deadline} onChange={e=>edit({deadline:e.target.value})}/></label>}</fieldset>}
      {panel==="code"&&<p>يعرض الكود الناتج من تصميم الصفحة ويمكن تصديره مع ملف الأنماط</p>}
    </aside><div className={styles.canvas} onDragOver={e=>{if(!readOnly)e.preventDefault();}} onDrop={e=>receiveDrop(e)}>
      {panel==="code"?<><label>HTML<textarea className={styles.code} readOnly value={html}/></label><label>CSS<textarea className={styles.code} readOnly value={storePageCss}/></label></>:<div className={styles.canvasInner} style={{width:mobile?375:"100%"}} role="tree" aria-label="تصميم الصفحة">{value.map(blockView)}{!value.length&&<div className={styles.dropHint}>اسحب عنصرًا إلى الصفحة أو اضغط على العنصر لإضافته</div>}</div>}
    </div></div>
  </div>;
}
export function Countdown({deadline}:{deadline:string}){const [now,setNow]=useState<number|null>(null);useEffect(()=>{const first=setTimeout(()=>setNow(Date.now()),0);const t=setInterval(()=>setNow(Date.now()),1000);return()=>{clearTimeout(first);clearInterval(t);};},[]);const end=Date.parse(deadline),seconds=now!==null&&Number.isFinite(end)?Math.max(0,Math.floor((end-now)/1000)):0;return <span dir="ltr">{Math.floor(seconds/86400)} : {Math.floor(seconds/3600)%24} : {Math.floor(seconds/60)%60} : {seconds%60}</span>;}
export function StoreRenderedBlocks({blocks,assets}:{blocks:StoreBlock[];assets:StoreAsset[]}){
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{const tick=()=>{root.current?.querySelectorAll<HTMLElement>("[data-store-deadline]").forEach(node=>{const end=Date.parse(node.dataset.storeDeadline??""),seconds=Number.isFinite(end)?Math.max(0,Math.floor((end-Date.now())/1000)):0;node.textContent=`${Math.floor(seconds/86400)} : ${Math.floor(seconds/3600)%24} : ${Math.floor(seconds/60)%60} : ${seconds%60}`;});};tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[blocks]);
  return <div ref={root}>{blocks.map(b=><div key={b.id} dangerouslySetInnerHTML={{__html:storeBlockHtml(b,assets)}}/>)}</div>;
}
