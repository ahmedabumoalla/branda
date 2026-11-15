import 'server-only';
import { getBrandFinanceContext } from './brand-finance';
import { erpRoleDomains,roleAllows,type ErpMyPermissions } from '@/lib/erp/roles';
import { isAldeemCafe } from '@/lib/platform/aldeem';

// Aldeem enterprise sections in the employee portal. The database decides again what each role may read or do.
const aldeemSections: { key: string; label: string; href: string; roles: string[] }[] = [
  { key: 'overview', label: 'نظرة عامة', href: '/dashboard/system/overview', roles: ['owner', 'manager', 'accountant', 'auditor', 'warehouse', 'cashier'] },
  { key: 'tracking', label: 'المتابعة والتتبع', href: '/dashboard/system/tracking', roles: ['owner', 'manager', 'accountant', 'auditor', 'warehouse', 'cashier'] },
  { key: 'families', label: 'الأسر المنتجة', href: '/dashboard/system/families', roles: ['owner', 'manager', 'accountant', 'auditor', 'warehouse'] },
  { key: 'food-safety', label: 'سجل سلامة الغذاء', href: '/dashboard/system/food-safety', roles: ['owner', 'manager', 'accountant', 'auditor', 'warehouse', 'cashier'] },
  { key: 'points', label: 'نقاط الولاء', href: '/dashboard/system/points', roles: ['owner', 'manager', 'accountant', 'auditor'] },
];
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
  const extra=isAldeemCafe(cafe)?aldeemSections.filter(section=>section.roles.includes(cafe.role)).map(({key,label,href})=>({key,label,href})):[];
  return {cafe,domains:[...extra,...domains],permissions};
}
