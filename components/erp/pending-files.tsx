"use client";
import { useRef } from "react";
import { Upload,Trash2 } from "lucide-react";
import { ERP_FILE_MAX } from "@/lib/erp/files";
import s from "./erp.module.css";
export type PendingErpFile={id:string;file:File};
export function PendingFiles({files,onChange,disabled,onError}:{files:PendingErpFile[];onChange:(files:PendingErpFile[])=>void;disabled:boolean;onError:(message:string)=>void}){
 const picker=useRef<HTMLInputElement>(null);
 function add(selected:File[]){if(disabled)return;if(files.length+selected.length>10){onError("يمكن إضافة عشرة مرفقات في كل حفظ");return;}if(selected.some(file=>!file.size||file.size>ERP_FILE_MAX)){onError("اختر ملفات غير فارغة لا يتجاوز كل منها خمسة ميجابايت");return;}onChange([...files,...selected.map(file=>({id:crypto.randomUUID(),file}))]);}
 return <section aria-label="المرفقات"><input ref={picker} hidden type="file" multiple accept=".png,.jpg,.jpeg,.pdf,.docx" onChange={e=>{add(Array.from(e.target.files||[]));e.target.value="";}}/><button type="button" disabled={disabled} className={s.dropzone} onClick={()=>picker.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();add(Array.from(e.dataTransfer.files));}}><Upload size={24}/><span>اسحب الملفات هنا أو اخترها من جهازك</span><small>تُرفع المرفقات عند حفظ السجل</small></button>{files.map(item=><div className={s.file} key={item.id}><span>{item.file.name}</span><button type="button" className={s.danger} disabled={disabled} aria-label={`إزالة ${item.file.name}`} onClick={()=>onChange(files.filter(f=>f.id!==item.id))}><Trash2 size={16}/></button></div>)}</section>;
}
