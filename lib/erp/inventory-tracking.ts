import {z} from 'zod';
export const trackingModes={quantity:'الكميات فقط',serial:'الرقم المسلسل',lot:'رقم الشحنة',expiry:'تاريخ الانتهاء',lot_expiry:'الشحنة وتاريخ الانتهاء'} as const;
export type TrackingMode=keyof typeof trackingModes;
export const trackingRowSchema=z.object({serial:z.string().trim().max(120).default(''),lot:z.string().trim().max(120).default(''),expiresOn:z.union([z.iso.date(),z.literal('')]).default(''),quantity:z.number().finite().positive().max(1e6).multipleOf(.001)});
export type TrackingRow=z.infer<typeof trackingRowSchema>;
export type InventoryLot={id:string;item_id:string;serial:string;lot:string;expires_on:string|null;warehouse_id:string;quantity:number};
export function parseSerialNumbers(text:string):TrackingRow[]{const values=text.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);if(!values.length||values.length>1000)throw new Error('أدخل من رقم مسلسل واحد إلى ١٠٠٠ رقم');if(new Set(values).size!==values.length||values.some(v=>v.length>120))throw new Error('الأرقام المسلسلة يجب ألا تتكرر وألا تتجاوز ١٢٠ حرفًا');return values.map(serial=>({serial,lot:'',expiresOn:'',quantity:1}));}
export function trackingTotal(rows:TrackingRow[]){return Math.round(rows.reduce((sum,row)=>sum+row.quantity,0)*1000)/1000;}
