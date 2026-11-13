"use client";
import {useState} from "react";
import Link from "@/components/erp/navigation";
import {getDocumentTemplates} from "@/app/actions/erp-templates";
import {defaultDocumentTemplate,documentTemplateLink,type DocumentTemplate,type DocumentTemplateValues,type DocumentTemplateTable} from "@/lib/erp/templates";
import {DocumentTemplatePrint} from "./document-template-print";
export function TemplatePrintChooser({kind,slug,values,table}:{kind:string;slug:string;values:DocumentTemplateValues;table:DocumentTemplateTable}){
 const [templates,setTemplates]=useState<DocumentTemplate[]|null>(null),[selected,setSelected]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const style={minHeight:44,padding:"10px 14px",border:"1px solid #e8e2d7",background:"white",color:"#28231b",borderRadius:2};
 const fallback=defaultDocumentTemplate(kind);fallback.layout.footer=String(values["التذييل"]??"");const current=templates?.find(t=>t.id===selected)??fallback;
 return <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>{templates===null?<button type="button" disabled={busy} style={style} onClick={async()=>{setBusy(true);setError("");try{const r=await getDocumentTemplates(slug,kind);if(r.ok){const active=r.data.filter(t=>t.channel==="print"&&t.layout.active);setTemplates(active);setSelected(active.find(t=>t.layout.isDefault)?.id??"");}else setError(r.message);}catch{setError("تعذر تحميل القوالب");}finally{setBusy(false);}}}>{busy?"جار تحميل القوالب":"طباعة / PDF"}</button>:<><select aria-label="قالب الطباعة" value={selected} onChange={e=>setSelected(e.target.value)} style={style}><option value="">قالب النظام</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><DocumentTemplatePrint template={current} values={values} table={table} slug={slug}/></>}<Link href={documentTemplateLink(kind)} style={style}>قوالب الطباعة</Link>{error&&<p role="alert" style={{color:"#a02d25"}}>{error}</p>}</div>;
}
