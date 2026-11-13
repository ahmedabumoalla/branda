import {z} from 'zod';
export const systemTaxSchema=z.object({id:z.uuid(),revision:z.number().int().min(0),name:z.string().trim().min(1).max(100),rate:z.union([z.literal(0),z.literal(15)]),active:z.boolean()}).strict();
export type SystemTax=z.infer<typeof systemTaxSchema>;
export const systemProductDefaultsSchema=z.object({revision:z.number().int().min(0),tax1Id:z.uuid().nullable(),tax2Id:z.uuid().nullable(),soldItemType:z.enum(['product','service','work'])}).strict();
export type SystemProductDefaults=z.infer<typeof systemProductDefaultsSchema>&{tax1:number;tax2:number;taxes:SystemTax[]};
export const defaultSystemProducts:SystemProductDefaults={revision:0,tax1Id:null,tax2Id:null,tax1:15,tax2:0,soldItemType:'product',taxes:[]};
