"use server";
import {actionResult} from '@/lib/platform/action-result';
import {readHr,writeHr} from '@/lib/data/erp-hr';
import type {HrQuery} from '@/lib/erp/hr';
import {hrEmployeeSchema} from '@/lib/erp/hr';
import {getBrandFinanceContext} from '@/lib/data/brand-finance';
import {readAssetSpreadsheet} from '@/lib/data/erp-assets-import';
import {z} from 'zod';
export async function readErpHr(query:Partial<HrQuery>,slug:string){return actionResult(()=>readHr(query,slug),'تعذر تحميل ملفات الموظفين');}
export async function writeErpHr(input:unknown,requestId:string,slug:string){return actionResult(()=>writeHr(input,requestId,slug),'تعذر حفظ بيانات الموظفين');}
export async function previewHrImport(form:FormData,slug:string){return actionResult(async()=>{const {cafe}=await getBrandFinanceContext(slug);if(cafe.role!=='owner')throw new Error('لا تملك صلاحية استيراد الموظفين');const file=form.get('file');if(!(file instanceof File))throw new Error('اختر ملف الموظفين');try{return {rows:await readAssetSpreadsheet(file,String(form.get('delimiter')||','))};}catch(error){throw new Error(error instanceof Error?error.message.replace('مائة أصل','مائة موظف'):'تعذر قراءة الملف');}},'تعذر قراءة ملف الموظفين');}
export async function importHrEmployees(input:unknown,slug:string){return actionResult(async()=>{const p=z.object({requestId:z.uuid(),rows:z.array(hrEmployeeSchema.refine(v=>!v.id&&!v.userId,'الاستيراد مخصص لموظفين جدد دون حساب دخول')).min(1).max(100)}).strict().safeParse(input);if(!p.success)throw new Error('راجع بيانات جميع صفوف الموظفين');const {client,cafe}=await getBrandFinanceContext(slug);const r=await client.rpc('erp_hr_import',{p_cafe_id:cafe.id,p_rows:p.data.rows,p_request_id:p.data.requestId});if(r.error){if(r.error.code==='23505')throw new Error('أحد أكواد الموظفين مستخدم بالفعل ولم يتم استيراد أي صف');if(r.error.message&&/[\u0600-\u06ff]/.test(r.error.message)&&r.error.message.length<300)throw new Error(r.error.message);throw new Error('تعذر استيراد الموظفين ولم يتم حفظ أي صف');}return r.data as {ids:string[];count:number};},'تعذر استيراد الموظفين');}
