import "server-only";
import {getBrandFinanceContext} from "@/lib/data/brand-finance";
import {assetError} from "@/lib/data/erp-assets";
import type {EmployeeAssetSnapshot} from "@/lib/erp/employee-assets";
export async function employeeAssetContext(write=false, slug?: string){const ctx=await getBrandFinanceContext(slug);if(!["owner","manager","accountant","auditor"].includes(ctx.cafe.role)||write&&!["owner","manager"].includes(ctx.cafe.role))throw new Error("لا تملك صلاحية عهد الموظفين");return ctx;}
export async function readEmployeeAssets(query:{id?:string;q?:string;employee?:string;page?:number}={}, slug?: string):Promise<EmployeeAssetSnapshot>{const{client,cafe}=await employeeAssetContext(false,slug);const{data,error}=await client.rpc("erp_employee_asset_read",{p_cafe:cafe.id,p_id:query.id||null,p_query:query.q||"",p_employee:query.employee||null,p_page:query.page||1});assetError(error);if(!data?.records)throw new Error("تعذر تحميل عهد الموظفين");return{...data,slug:cafe.slug,cafeName:cafe.name} as EmployeeAssetSnapshot;}
