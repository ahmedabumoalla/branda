import 'server-only';
import { getBrandFinanceContext } from './brand-finance';
import { erpRoleDomains,roleAllows,type ErpMyPermissions } from '@/lib/erp/roles';
export async function readErpStaffShell(slug:string) {
  const {client,cafe}=await getBrandFinanceContext(slug);
  const {data,error}=await client.rpc('erp_my_permissions',{p_cafe_id:cafe.id});
  if(error||!data)throw new Error('تعذر التحقق من صلاحيات النظام');
  const permissions=data as ErpMyPermissions;
  const management=['owner','manager','accountant','auditor'].includes(cafe.role);
  const available=new Set(['branches','store','manufacturing','inventory','purchases','cheques','reports','requests','tasks','bookings','contracting','installments','commissions','rentals','work_orders','workflows','time','customers','credits','memberships','customer_attendance','insurance','assets','accounting','finance','custody','organization','hr','attendance','payroll','templates']);
  const domains=erpRoleDomains.filter(d=>{
    if(!available.has(d.key)||!roleAllows(permissions,d.key,'read'))return false;
    const policy=cafe.employeePermissions;
    if(policy&&cafe.role!=='owner'&&['inventory','purchases','accounting','finance','reports','customers'].includes(d.key)){
      const prefixes=d.key==='purchases'?['purchases.','suppliers.']:d.key==='customers'?['sales.']:[`${d.key}.`];
      return Object.entries(policy).some(([key,rule])=>prefixes.some(prefix=>key.startsWith(prefix))&&rule.enabled);
    }
    return management||d.key==='requests'||d.key==='attendance'||cafe.role==='warehouse'&&['inventory','manufacturing','reports'].includes(d.key);
  });
  return {cafe,domains,permissions};
}
