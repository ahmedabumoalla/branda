import {z} from 'zod';
export const contractingAdvanceSchema=z.object({id:z.uuid(),revision:z.number().int().positive(),contract_id:z.uuid().nullable(),amount:z.number().positive().max(1e9),tax_rate:z.union([z.literal(0),z.literal(15)])});
export type ContractingAdvance={invoice_id:string;project_id:string;contract_id:string|null;assignment_revision:number;party_id:string;displayNumber:string;number:number;net:number;tax:number;total:number;available:number;used:number;outstanding:number;created_at:string;allocations:{invoice_id:string;amount:number;net:number;tax:number}[]};
