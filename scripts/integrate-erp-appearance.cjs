const fs=require('fs');function edit(file,changes){let s=fs.readFileSync(file,'utf8');for(const [before,after]of changes){if(!s.includes(before))throw Error('Marker changed '+file);s=s.replace(before,()=>after);}fs.writeFileSync(file,s);}
edit('app/dashboard/system/layout.tsx',[
 ["import type {ReactNode} from 'react';","import type {ReactNode} from 'react';\nimport {SystemAppearance} from '@/components/erp/settings/appearance';"],
 ['return <BranchContextProvider>{children}</BranchContextProvider>;','return <SystemAppearance><BranchContextProvider>{children}</BranchContextProvider></SystemAppearance>;']
]);
edit('app/finance/[slug]/system/[[...parts]]/page.tsx',[
 ["import {StaffShell} from '@/components/erp/staff-shell';","import {StaffShell} from '@/components/erp/staff-shell';\nimport {SystemAppearance} from '@/components/erp/settings/appearance';"],
 ['domains={shell.domains}>{content}</StaffShell>','domains={shell.domains}><SystemAppearance slug={slug}>{content}</SystemAppearance></StaffShell>']
]);
edit('lib/erp/report-catalog.ts',[["const bases:Partial<Record<ReportSource,string>>={sales:","const bases:Partial<Record<ReportSource,string>>={'sales-lines':'للمبيعات المؤجلة تحسب تكلفة التسليم والاستلام حتى نهاية الفترة وتبقى التكلفة والربح غير مكتملين للبنود التي لم يكتمل صرفها أو استلام مرتجعها',sales:"]]);
