import 'server-only';
import {branchRpc} from './erp-branches';
import {branchInput} from '@/lib/erp/branches';
import {z} from 'zod';
import {getBrandFinanceContext} from './brand-finance';
import {payrollActionSchema,payrollExpression,type PayrollSnapshot} from '@/lib/erp/payroll';
function failure(error:{code?:string;message?:string}|null){if(!error)return;if(error.code==='23505')throw new Error('الكود مستخدم بالفعل');if(error.code==='23503')throw new Error('السجل مرتبط بمستندات أخرى ولا يمكن حذفه');if(error.message&&/[\u0600-\u06ff]/.test(error.message)&&error.message.length<350)throw new Error(error.message);throw new Error('تعذر تأكيد عملية المرتبات');}
export async function readPayroll(slug?:string){const {client,cafe}=await getBrandFinanceContext(slug);const result=await client.rpc('erp_payroll_read',{p_cafe_id:cafe.id});failure(result.error);return {...result.data,cafeName:cafe.name,slug:cafe.slug} as PayrollSnapshot;}
export async function writePayroll(input:unknown,requestId:string,slug:string){
 const parsed=payrollActionSchema.safeParse(branchInput(input));if(!parsed.success||!z.uuid().safeParse(requestId).success)throw new Error(parsed.success?'معرف الطلب غير صالح':parsed.error.issues.find(i=>/[\u0600-\u06ff]/.test(i.message))?.message||'راجع الحقول المطلوبة');
 const {client,cafe}=await getBrandFinanceContext(slug);const command=parsed.data;let data:Record<string,unknown>=command.data;
 if(['component','structure','contract','payslip'].includes(command.action)){
  const current=await client.rpc('erp_payroll_read',{p_cafe_id:cafe.id});failure(current.error);const codes=(current.data as PayrollSnapshot).components.map(c=>c.code);
  const ast=(line:Record<string,unknown>)=>({...line,formulaAst:payrollExpression(String(line.formula||''),codes),conditionAst:payrollExpression(String(line.condition||''),codes)});
  data=ast(data);if(Array.isArray(data.lines))data={...data,lines:data.lines.map(ast)};
 }
 const result=await branchRpc(client,cafe.id,'erp_payroll_write',{p_cafe_id:cafe.id,p_action:command.action,p_data:data,p_request_id:requestId},input);failure(result.error);return result.data as {id:string};
}
