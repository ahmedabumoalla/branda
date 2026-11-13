import 'server-only';
import {getBrandFinanceContext} from './brand-finance';
import {branchScopeOf,type BranchScope} from '@/lib/erp/branches';

const operations=new Set(['brand_finance_treasury_snapshot','brand_finance_treasury_statement','brand_finance_treasury_history','brand_finance_terminal_fee_history','brand_finance_treasury_execute','brand_finance_cash_handovers','brand_finance_receive_shift_cash','brand_finance_treasury_attachment']);
export async function treasuryScopedContext(slug?:string,scope?:BranchScope|null){
 const context=await getBrandFinanceContext(slug),expected=branchScopeOf({branchScope:scope});
 const client=new Proxy(context.client,{get(target,key,receiver){if(key==='rpc')return(name:string,args:Record<string,unknown>)=>{if(!operations.has(name))throw new Error('عملية الخزينة غير متاحة');return target.rpc('erp_treasury',{p_cafe:context.cafe.id,p_function:name,p_arguments:args,p_scope:expected});};return Reflect.get(target,key,receiver)}});
 return {...context,client};
}
