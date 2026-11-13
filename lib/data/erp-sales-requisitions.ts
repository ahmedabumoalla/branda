import 'server-only';
import {inventoryContext} from './erp-inventory';
import {assetError} from './erp-assets';
import type {SalesRequisitionSnapshot} from '@/lib/erp/sales-requisitions';
export async function readSalesRequisitions(slug?:string):Promise<SalesRequisitionSnapshot>{const{client,cafe}=await inventoryContext(false,slug);const{data,error}=await client.rpc('erp_sales_requisitions_read',{p_cafe_id:cafe.id});assetError(error);if(!data?.requests)throw new Error('تعذر تحميل أذون المبيعات');return{...data,slug:cafe.slug};}
