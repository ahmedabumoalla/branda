"use client";
import { useRef,useState } from "react";
import { previewDocumentTemplate } from "@/app/actions/erp-templates";
import { type DocumentTemplate,type DocumentTemplateTable,type DocumentTemplateValues } from "@/lib/erp/templates";
import { Modal } from "@/components/dashboard/ui/modal";
import {useSystemPreferences} from '@/components/erp/settings/preferences';
import {printDocumentFrame} from '@/lib/export/document-template-print';
export function DocumentTemplatePrint({template,values,table={head:[],rows:[]},slug,title}:{template:DocumentTemplate;values:DocumentTemplateValues;table?:DocumentTemplateTable;slug:string;title?:string}){
 const {documentView}=useSystemPreferences();
 const [preview,setPreview]=useState<{html:string;mode:'browser'|'pdf';version:number}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[printing,setPrinting]=useState(false),iframe=useRef<HTMLIFrameElement>(null),version=useRef(0),autoOpened=useRef(0),printLock=useRef<number|null>(null);
 function close(){version.current++;setPreview(null);setReady(false);setPrinting(false);setError('');}
 async function print(current:number){if(printLock.current===current)return;const frame=iframe.current;printLock.current=current;setPrinting(true);setError('');try{await printDocumentFrame(frame,()=>version.current===current&&iframe.current===frame);}catch(reason){if(version.current===current)setError(reason instanceof Error?reason.message:'تعذر فتح نافذة الطباعة استخدم زر إعادة الفتح');}finally{if(printLock.current===current)printLock.current=null;if(version.current===current)setPrinting(false);}}
 async function open(){const current=++version.current;setBusy(true);setError('');setReady(false);setPreview(null);try{const result=await previewDocumentTemplate(slug,template,values,table);if(current!==version.current)return;if(result.ok)setPreview({html:result.data.html,mode:documentView,version:current});else setError(result.message);}catch{if(current===version.current)setError('تعذر تجهيز المعاينة');}finally{if(current===version.current)setBusy(false);}}
 return <><button type="button" disabled={busy||printing} onClick={()=>void open()} style={{minHeight:44,padding:'10px 16px',border:'1px solid #e8e2d7',background:'white',borderRadius:2,color:'#28231b',cursor:'pointer'}}>{busy?'جاري تجهيز المعاينة':title??(documentView==='pdf'?'حفظ PDF':'معاينة وطباعة')}</button>{error&&!preview&&<p role="alert" style={{color:'#a02d25'}}>{error}</p>}
 <Modal open={!!preview} title={preview?.mode==='pdf'?`حفظ PDF ${template.name}`:template.name} onClose={close} panelClassName="w-[min(1100px,96vw)]" footer={<button type="button" disabled={!ready||printing} style={{minHeight:44,padding:'10px 18px',background:'#28231b',color:'white'}} onClick={()=>preview&&void print(preview.version)}>{printing?'جار فتح نافذة الطباعة':preview?.mode==='pdf'?'فتح نافذة حفظ PDF':'طباعة أو حفظ PDF'}</button>}>
 {preview?.mode==='pdf'&&<p role="status" className="mb-3 rounded-lg bg-[#faf7f0] p-3 text-sm text-[#594b39]">تفتح نافذة الطباعة بعد تحميل المستند اختر حفظ بصيغة PDF ثم حدد مكان الملف وإذا لم تفتح استخدم زر فتح نافذة حفظ PDF</p>}
 {error&&<p role="alert" style={{color:'#a02d25'}}>{error}</p>}
 {preview&&<iframe key={preview.version} ref={iframe} title="معاينة المستند" srcDoc={preview.html} sandbox="allow-same-origin allow-modals" onLoad={()=>{if(version.current!==preview.version)return;setReady(true);if(preview.mode==='pdf'&&autoOpened.current!==preview.version){autoOpened.current=preview.version;void print(preview.version);}}} style={{width:'100%',height:'70vh',border:'1px solid #e8e2d7'}}/>}
 </Modal></>;
}
