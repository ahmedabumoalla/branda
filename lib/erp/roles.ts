import {z} from "zod";
export const erpRoleDomains=[
 {key:"insurance",label:"وكلاء التأمين",group:"customers",href:"/dashboard/system/insurance"},
 {key:"store",label:"المتجر الإلكتروني",group:"operations",href:"/dashboard/system/store"},
 {key:"manufacturing",label:"التصنيع",group:"operations",href:"/dashboard/system/manufacturing"},
 {key:"tasks",label:"إدارة المهام",group:"operations",href:"/dashboard/system/tasks"},
 {key:"bookings",label:"الحجوزات",group:"operations",href:"/dashboard/system/bookings"},
 {key:"contracting",label:"المقاولات",group:"operations",href:"/dashboard/system/contracting"},
 {key:"installments",label:"الأقساط",group:"operations",href:"/dashboard/system/installments"},
 {key:"commissions",label:"المبيعات المستهدفة والعمولات",group:"operations",href:"/dashboard/system/commissions"},
 {key:"rentals",label:"الإيجارات والوحدات",group:"operations",href:"/dashboard/system/rentals"},
 {key:"work_orders",label:"أوامر الشغل",group:"operations",href:"/dashboard/system/work-orders"},
 {key:"workflows",label:"دورات العمل",group:"operations",href:"/dashboard/system/workflows"},
 {key:"time",label:"تتبع الوقت",group:"operations",href:"/dashboard/system/time"},
 {key:"customers",label:"العملاء وإدارة العلاقات",group:"operations",href:"/dashboard/system/customers"},
 {key:"credits",label:"النقاط والأرصدة الخدمية",group:"operations",href:"/dashboard/system/credits"},
 {key:"memberships",label:"العضويات والاشتراكات",group:"operations",href:"/dashboard/system/memberships"},
 {key:"customer_attendance",label:"حضور العملاء",group:"operations",href:"/dashboard/system/customer-attendance"},
 {key:"assets",label:"الأصول",group:"operations",href:"/dashboard/system/assets"},
 {key:"inventory",label:"المخزون",group:"operations",href:"/dashboard/system/inventory"},
 {key:"accounting",label:"الحسابات العامة",group:"operations",href:"/dashboard/system/accounting"},
 {key:"finance",label:"المالية والعهد والمطابقة البنكية",group:"operations",href:"/dashboard/system/finance"},
 {key:"purchases",label:"المشتريات والموردون",group:"operations",href:"/dashboard/system/purchases"},
 {key:"cheques",label:"دورة الشيكات",group:"operations",href:"/dashboard/system/cheques"},
 {key:"reports",label:"التقارير",group:"operations",href:"/dashboard/system/reports"},
 {key:"requests",label:"طلبات الموظفين",group:"operations",href:"/dashboard/system/requests"},
 {key:"custody",label:"عهد الموظفين",group:"hr",href:"/dashboard/system/employee-assets"},
 {key:"organization",label:"الهيكل التنظيمي",group:"hr",href:"/dashboard/system/organization"},
 {key:"hr",label:"الموظفون والمستندات",group:"hr",href:"/dashboard/system/employees"},
 {key:"attendance",label:"الحضور والإجازات والورديات",group:"hr",href:"/dashboard/system/attendance"},
 {key:"payroll",label:"المرتبات",group:"hr",href:"/dashboard/system/payroll"},
 {key:"branches",label:"الفروع",group:"settings",href:"/dashboard/system/branches"},
 {key:"templates",label:"القوالب والمستندات",group:"settings",href:"/dashboard/system/templates"},
] as const;
export const erpRoleActions={read:"عرض السجلات",create:"إضافة سجلات",update:"تعديل السجلات",delete:"حذف السجلات",approve:"اعتماد العمليات وترحيلها",settings:"إدارة الإعدادات",files:"إدارة الملفات والمرفقات"} as const;
export type ErpRoleDomain=typeof erpRoleDomains[number]['key'];export type ErpRoleAction=keyof typeof erpRoleActions;
export const rolePermissionSchema=z.object({read:z.boolean(),create:z.boolean(),update:z.boolean(),delete:z.boolean(),approve:z.boolean(),settings:z.boolean(),files:z.boolean()}).strict();
export type ErpRolePermissions=Record<ErpRoleDomain,z.infer<typeof rolePermissionSchema>>;
export function emptyRolePermissions():ErpRolePermissions{return Object.fromEntries(erpRoleDomains.map(d=>[d.key,Object.fromEntries(Object.keys(erpRoleActions).map(k=>[k,false]))])) as ErpRolePermissions;}
export const erpRoleSchema=z.object({id:z.uuid(),revision:z.number().int().min(0),name:z.string().trim().min(1).max(160),description:z.string().max(1000),kind:z.enum(["user","employee"]),active:z.boolean(),permissions:z.record(z.enum(erpRoleDomains.map(d=>d.key) as [ErpRoleDomain,...ErpRoleDomain[]]),rolePermissionSchema),blocked:z.array(z.enum(erpRoleDomains.map(d=>d.key) as [ErpRoleDomain,...ErpRoleDomain[]])).max(erpRoleDomains.length)}).strict().superRefine((v,c)=>{for(const d of erpRoleDomains){const p=v.permissions[d.key];if(p&&!p.read&&Object.entries(p).some(([k,x])=>k!=="read"&&x))c.addIssue({code:"custom",path:["permissions",d.key],message:"فعّل عرض السجلات قبل منح صلاحيات أخرى"});if(v.kind==="employee"&&d.group!=="hr"&&p&&Object.values(p).some(Boolean))c.addIssue({code:"custom",path:["permissions",d.key],message:"دور الموظف يقتصر على أقسام الموارد البشرية"});}});
export type ErpRoleInput=z.infer<typeof erpRoleSchema>;export type ErpRole=ErpRoleInput&{created_at:string;updated_at:string;assigned_count:number};
export type ErpRoleAssignment={id:string;role_id:string;user_id:string|null;employee_id:string|null;revision:number;name:string;finance_role:string|null;active:boolean};
export type ErpRolesSnapshot={roles:ErpRole[];assignments:ErpRoleAssignment[];users:{id:string;name:string;role:string;active:boolean}[];employees:{id:string;name:string;user_id:string|null;active:boolean}[];events:{id:number;record_id:string;action:string;created_at:string}[];canWrite:boolean;slug:string;ownerId:string};
export type ErpMyPermissions={custom:boolean;roleName:string|null;active:boolean;permissions:ErpRolePermissions;blocked:ErpRoleDomain[]};
export function roleAllows(access:ErpMyPermissions,domain:ErpRoleDomain,action:ErpRoleAction){return !access.custom||access.active&&!access.blocked.includes(domain)&&access.permissions[domain]?.read&&access.permissions[domain]?.[action];}
