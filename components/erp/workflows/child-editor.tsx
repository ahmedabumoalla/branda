'use client';
import {useState,type FormEvent} from 'react';
import {ErpFieldValues} from '@/components/erp/fields/field-values';
import type {WorkflowChild,WorkflowCommand,WorkflowModel,WorkflowSnapshot} from '@/lib/erp/workflows';
import s from '@/components/erp/installments/installments.module.css';
export function WorkflowChildEditor({initial,model,snapshot,pending,onSave,onCancel}:{initial:WorkflowChild;model:WorkflowModel;snapshot:WorkflowSnapshot;pending:boolean;onSave:(c:WorkflowCommand)=>Promise<boolean>;onCancel:()=>void}){
 const [values,setValues]=useState(initial.values);const sources={customers:{label:'العملاء',options:snapshot.finance.parties.filter(x=>x.kind==='customer')},employees:{label:'الموظفون',options:snapshot.finance.staff.map(x=>({id:x.user_id,name:x.name}))},items:{label:'الأصناف',options:snapshot.finance.items},accounts:{label:'الحسابات',options:snapshot.finance.accounts},warehouses:{label:'المستودعات',options:snapshot.finance.warehouses}};
 function save(e:FormEvent<HTMLFormElement>){e.preventDefault();void onSave({action:'child',payload:{id:initial.id,revision:initial.revision,recordId:initial.recordId,modelId:model.id,values,draft:(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='draft'}});}
 return <form className={s.form} onSubmit={save}><h2>{model.name}</h2><fieldset disabled={pending} style={{border:0}}><ErpFieldValues fields={model.fields} values={values} sources={sources} update={(id,value)=>setValues(v=>({...v,[id]:value}))} fileContext={initial.revision?{slug:snapshot.slug,entityType:'workflow_child',recordId:initial.id}:undefined}/></fieldset>{!initial.revision&&model.fields.some(f=>['file','image'].includes(f.type))&&<p>احفظ كمسودة لإرفاق الملفات ثم أكمل النموذج</p>}<div className={s.actions}><button className={s.primary} disabled={pending} value="save">حفظ</button><button disabled={pending} value="draft">حفظ كمسودة</button><button type="button" onClick={onCancel}>إلغاء</button></div></form>;
}
