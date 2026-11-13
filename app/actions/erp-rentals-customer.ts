"use server";
import {z} from 'zod';
import {actionResult} from '@/lib/platform/action-result';
import {rentalCustomerCall,type RentalCustomerSnapshot} from '@/lib/data/erp-rentals-customer';
const quoteSchema=z.object({unitIds:z.array(z.uuid()).min(1).max(10),start:z.iso.datetime({offset:true}),end:z.iso.datetime({offset:true})});
export async function rentalCustomerRead(slug:string){return actionResult(async()=>await rentalCustomerCall(slug,'read') as RentalCustomerSnapshot,'تعذر تحميل حجوزاتك');}
export async function rentalCustomerQuote(slug:string,input:unknown){return actionResult(async()=>await rentalCustomerCall(slug,'quote',quoteSchema.parse(input)) as {total:number},'تعذر حساب سعر الحجز');}
export async function rentalCustomerBook(slug:string,input:unknown,request:string){return actionResult(async()=>{const p=quoteSchema.extend({expectedTotal:z.number().nonnegative().max(1e9),notes:z.string().max(2000),fields:z.record(z.string(),z.union([z.string().max(2000),z.number().finite(),z.boolean()]))}).parse(input);return await rentalCustomerCall(slug,'book',p,z.uuid().parse(request)) as {id:string}},'تعذر حفظ الحجز');}
export async function rentalCustomerCancel(slug:string,id:string,request:string){return actionResult(async()=>await rentalCustomerCall(slug,'cancel',{id:z.uuid().parse(id)},z.uuid().parse(request)) as {id:string},'تعذر إلغاء الحجز');}
