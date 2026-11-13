'use client';
import{useState}from'react';
import{ErpFieldValues}from'@/components/erp/fields/field-values';
import{ErpFiles}from'@/components/erp/files';
import type{RequestType,RequestsSnapshot,RequestCommand}from'@/lib/erp/requests';
import s from '@/components/erp/installments/installments.module.css';
export function RequestMoreInfo({type,snapshot,pending,onSave}:{type:RequestType;snapshot:RequestsSnapshot;pending:boolean;onSave:(c:RequestCommand)=>void}){const[values,set]=useState(type.moreValues??{});if(!type.canReadMore)return null;return <section className={s.panel}><h2>{type.moreName}</h2><p>{type.moreDescription}</p><form className={s.form} onSubmit={e=>{e.preventDefault();onSave({action:'more',payload:{id:type.id,revision:type.revision,values}});}}><fieldset disabled={pending}><ErpFieldValues fields={type.moreFields} values={values} sources={snapshot.sources} readOnly={!type.canEditMore} fileContext={{slug:snapshot.slug,recordId:type.id,entityType:'request_type'}} update={(k,v)=>set({...values,[k]:v})}/></fieldset>{type.canEditMore&&<button className={s.primary} disabled={pending}>حفظ المعلومات الإضافية</button>}</form><ErpFiles entityType="request_type" slug={snapshot.slug} recordId={type.id} canWrite={type.canEditMore}/></section>}
