import {z} from 'zod';
import {safeErpRichText} from './custom-fields';

export function taskNoteHasText(value:string){return safeErpRichText(value).replace(/<\/?(?:p|br|b|strong|i|em|u|s|ul|ol|li|blockquote|h2|h3|h4)\s*\/?\s*>/gi,'').replace(/&(?:amp;)?(?:nbsp|#160|#xA0);/gi,'').trim().length>0;}
export function taskNoteTags(value:string){return value.split(/[,،\n]/).map(v=>v.trim()).filter(Boolean);}
export const taskNoteInputSchema=z.object({
 id:z.uuid(),note:z.string().trim().min(1).max(20000),occurredAt:z.iso.datetime({offset:true}),
 format:z.enum(['plain','rich']).default('plain'),tags:z.array(z.string().trim().min(1).max(80).refine(v=>!/[\u0000-\u001f\u007f]/.test(v),'الوسم يحتوي على محارف غير صالحة')).max(20).default([]),
}).strict().superRefine((v,c)=>{
 if(new Set(v.tags.map(t=>t.toLocaleLowerCase('en-US'))).size!==v.tags.length)c.addIssue({code:'custom',message:'احذف الوسوم المتكررة',path:['tags']});
 if(v.format==='rich'&&(!taskNoteHasText(v.note)||safeErpRichText(v.note).length>20000))c.addIssue({code:'custom',message:'أدخل ملاحظة واضحة لا تتجاوز عشرين ألف حرف',path:['note']});
}).transform(v=>({...v,note:v.format==='rich'?safeErpRichText(v.note):v.note}));
