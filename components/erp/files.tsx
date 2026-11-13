"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import { Download,FileText,Trash2,Upload } from "lucide-react";
import { downloadErpFile,listErpFiles,removeErpFile,uploadErpFile } from "@/app/actions/erp-files";
import { ERP_FILE_MAX,type ErpFile,type ErpFileEntity } from "@/lib/erp/files";
import { Modal } from "@/components/dashboard/ui/modal";
import s from "./erp.module.css";

export function ErpFiles({entityType,recordId,slug,canWrite}:{entityType:ErpFileEntity;recordId:string;slug:string;canWrite:boolean}){
 const [files,setFiles]=useState<ErpFile[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[loaded,setLoaded]=useState(false),[deleting,setDeleting]=useState<ErpFile|null>(null);
 const picker=useRef<HTMLInputElement>(null),request=useRef<{key:string;id:string}|null>(null),lock=useRef(false);
 const target={entityType,recordId};
 const refresh=useCallback(async()=>{const result=await listErpFiles(slug,{entityType,recordId});if(result.ok){setFiles(result.data);setLoaded(true);}else setError(result.message);},[slug,entityType,recordId]);
 useEffect(()=>{let alive=true;listErpFiles(slug,{entityType,recordId}).then(r=>{if(alive){if(r.ok){setFiles(r.data);setLoaded(true);}else setError(r.message);}}).catch(()=>{if(alive)setError("تعذر تحميل المرفقات");});return()=>{alive=false;};},[slug,entityType,recordId]);
 async function upload(file:File){
  if(lock.current||!canWrite)return;
  if(file.size>ERP_FILE_MAX){setError("الملف يتجاوز خمسة ميجابايت");return;}
  lock.current=true;setBusy(true);setError("");
  const key=[file.name,file.size,file.lastModified,recordId].join(":");if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};
  try{const data=new FormData();data.set("file",file);const result=await uploadErpFile(slug,{...target,id:request.current.id},data);if(result.ok){await refresh();request.current=null;if(picker.current)picker.current.value="";}else setError(result.message);}catch{setError("تعذر رفع الملف أعد المحاولة بالملف نفسه");}finally{setBusy(false);lock.current=false;}
 }
 async function remove(){if(!deleting||lock.current)return;lock.current=true;setBusy(true);setError("");try{const result=await removeErpFile(slug,{...target,id:deleting.id});if(result.ok){setDeleting(null);await refresh();}else setError(result.message);}catch{setError("تعذر حذف الملف");}finally{setBusy(false);lock.current=false;}}
 return <section className={s.workspace} aria-label="المرفقات">
  {error&&<div role="alert" className={s.error}>{error}<button type="button" className={s.button} onClick={()=>void refresh()}>إعادة التحميل</button></div>}
  {canWrite&&<><input ref={picker} type="file" accept={entityType==="document_template"?".png,.jpg,.jpeg,.pdf,.docx,.xlsx,.csv,.txt":".png,.jpg,.jpeg,.pdf,.docx"} hidden onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);}}/><button type="button" className={s.dropzone} disabled={busy} onClick={()=>picker.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const file=e.dataTransfer.files[0];if(file)void upload(file);}}><Upload size={24} aria-hidden="true"/><span>{busy?"جاري معالجة الملف ورفعه":"اسحب الملف هنا أو اختر ملفًا من جهازك"}</span><small>{entityType==="document_template"?"صور أو PDF أو DOCX أو XLSX أو CSV أو TXT حتى خمسة ميجابايت":"صور أو مستندات حتى خمسة ميجابايت"}</small></button></>}
  {!loaded&&!error&&<p role="status">جاري تحميل المرفقات</p>}{loaded&&!files.length&&<p className={s.muted}>لا توجد مرفقات</p>}
  {files.map(file=><div key={file.id} className={s.file}><FileText size={18} aria-hidden="true"/><span>{file.name}<small className={s.muted}> — {Math.ceil(file.size_bytes/1024)} كيلوبايت</small>{!file.uploaded&&<small role="status">لم يكتمل الرفع</small>}</span><button type="button" className={s.button} disabled={busy||!file.uploaded} aria-label={`تنزيل ${file.name}`} onClick={async()=>{try{const result=await downloadErpFile(slug,{...target,id:file.id});if(result.ok){const link=document.createElement("a");link.href=result.data.url;link.rel="noopener";link.click();}else setError(result.message);}catch{setError("تعذر تنزيل المرفق");}}}><Download size={16}/></button>{canWrite&&<button type="button" className={s.danger} disabled={busy} aria-label={`حذف ${file.name}`} onClick={()=>setDeleting(file)}><Trash2 size={16}/></button>}</div>)}
  <Modal open={!!deleting} title="حذف المرفق" onClose={()=>{if(!busy)setDeleting(null);}} panelClassName={s.dialog} footer={<div className={s.inline}><button type="button" className={s.danger} disabled={busy} onClick={()=>void remove()}>حذف المرفق</button><button type="button" className={s.button} disabled={busy} onClick={()=>setDeleting(null)}>إلغاء</button></div>}><p>هل تريد حذف المرفق {deleting?.name} من هذا السجل؟</p></Modal>
 </section>;
}
