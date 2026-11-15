'use client';

import {useRef,useState} from 'react';
import {Layers3,Pencil,Plus} from 'lucide-react';
import {executeInventory} from '@/app/actions/erp-inventory';
import {Modal} from '@/components/dashboard/ui/modal';
import {withBranchScope} from '@/components/erp/branches/context';
import type {InventoryCatalog,InventorySnapshot} from '@/lib/erp/inventory';
import {UnitTemplateEditor,type UnitTemplateSavePayload} from './unit-template-editor';
import styles from './unit-template-dialog.module.css';

type UnitTemplateDialogProps={
 snapshot:InventorySnapshot;
 initialTemplate?:InventoryCatalog;
 onClose:()=>void;
 onSaved?:(template:InventoryCatalog)=>void;
};

export function UnitTemplateDialog({snapshot,initialTemplate,onClose,onSaved}:UnitTemplateDialogProps){
 const[busy,setBusy]=useState(false),[error,setError]=useState('');
 const saving=useRef(false),retry=useRef<{body:string;requestId:string}|null>(null);
 const canSave=initialTemplate?snapshot.canUpdate:snapshot.canCreate;
 const close=()=>{if(!saving.current)onClose();};

 async function save(value:UnitTemplateSavePayload):Promise<boolean>{
  if(saving.current)return false;
  if(!canSave||initialTemplate&&initialTemplate.kind!=='unit_template'){
   setError('لا تملك صلاحية حفظ قالب الوحدات');return false;
  }
  saving.current=true;setBusy(true);setError('');
  const name=value.name.trim(),payload={...initialTemplate?.payload,...value.payload};
  const active=initialTemplate?.active??true;
  const command=withBranchScope({action:'catalog',id:initialTemplate?.id??'',revision:initialTemplate?.revision??0,payload:{...payload,kind:'unit_template',name,active}},snapshot);
  const body=JSON.stringify({slug:snapshot.slug,command});
  const requestId=retry.current?.body===body?retry.current.requestId:crypto.randomUUID();
  retry.current={body,requestId};
  let saved:InventoryCatalog|null=null;
  try{
   const result=await executeInventory({...command,requestId},snapshot.slug);
   if(!result.ok){setError(result.message);return false;}
   if(!result.data.id){setError('لم يكتمل حفظ القالب أعد المحاولة بنفس البيانات');return false;}
   saved={id:result.data.id,kind:'unit_template',name,active,payload,revision:(initialTemplate?.revision??0)+1};
   retry.current=null;
  }catch{
   setError('تعذر الاتصال أعد المحاولة بنفس البيانات');return false;
  }finally{
   saving.current=false;setBusy(false);
  }
  onSaved?.(saved);onClose();return true;
 }

 return <Modal open title={initialTemplate?'تعديل قالب الوحدات':'إضافة قالب وحدات'} onClose={close} panelClassName={styles.dialog}>
  <div className={styles.dialogBody} aria-busy={busy} onSubmit={event=>event.stopPropagation()}>
   <fieldset className={styles.editorFields} disabled={busy||!canSave}>
    <UnitTemplateEditor units={snapshot.units} initialTemplate={initialTemplate} busy={busy} error={error||(!canSave?'لا تملك صلاحية حفظ قالب الوحدات':'')} onSave={save} onCancel={close}/>
   </fieldset>
  </div>
 </Modal>;
}

function unitNames(template:InventoryCatalog){
 const units=Array.isArray(template.payload.units)?template.payload.units:[];
 return units.flatMap(unit=>unit&&typeof unit==='object'&&typeof unit.name==='string'?[unit.name]:[]);
}

export function UnitTemplateManager({snapshot,disabled=false}:{snapshot:InventorySnapshot;disabled?:boolean}){
 const[editing,setEditing]=useState<InventoryCatalog|'new'|null>(null);
 const[savedTemplates,setSavedTemplates]=useState<InventoryCatalog[]>([]);
 const[notice,setNotice]=useState('');
 const templates=snapshot.catalogs.filter(row=>row.kind==='unit_template').map(row=>{
  const saved=savedTemplates.find(value=>value.id===row.id);
  return saved&&saved.revision>=row.revision?saved:row;
 });
 templates.push(...savedTemplates.filter(row=>!snapshot.catalogs.some(value=>value.id===row.id)));

 return <>
  <section className={styles.manager} aria-label="قالب الوحدات">
   <div className={styles.heading}>
    <span className={styles.icon} aria-hidden="true"><Layers3 size={22}/></span>
    <div className={styles.intro}><h2>قالب الوحدات</h2><p>اربط القطعة بوحدات التعبئة الأكبر لاستخدامها في الشراء والبيع</p></div>
    <button type="button" className={styles.addButton} disabled={disabled||!snapshot.canCreate} onClick={()=>{setNotice('');setEditing('new');}}><Plus size={17} aria-hidden="true"/>إضافة قالب</button>
   </div>
   {templates.length?<ul className={styles.templateList}>{templates.map(template=><li key={template.id}>
    <button type="button" className={styles.template} disabled={disabled||!snapshot.canUpdate} aria-label={`تعديل قالب ${template.name}`} onClick={()=>{setNotice('');setEditing(template);}}>
     <span className={styles.templateInfo}><strong>{template.name}</strong><span className={styles.units}>{unitNames(template).join(' / ')||'وحدة أساسية'}</span></span>
     {!template.active&&<span className={styles.inactive}>غير نشط</span>}
     <Pencil size={16} className={styles.editIcon} aria-hidden="true"/>
    </button>
   </li>)}</ul>:<p className={styles.empty}>لا توجد قوالب بعد أضف قالبًا لاستخدام نفس ترتيب الوحدات مع أصنافك</p>}
   {notice&&<p className={styles.notice} role="status">{notice}</p>}
  </section>
  {editing!==null&&<UnitTemplateDialog key={editing==='new'?'new':`${editing.id}-${editing.revision}`} snapshot={snapshot} initialTemplate={editing==='new'?undefined:editing} onClose={()=>setEditing(null)} onSaved={template=>{setSavedTemplates(previous=>[...previous.filter(row=>row.id!==template.id),template]);setNotice('تم حفظ قالب الوحدات');}}/>}
 </>;
}
