const fs = require('node:fs');
function replace(file, before, after) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(before)) throw Error(`Integration anchor missing: ${file}`);
  fs.writeFileSync(file, text.replace(before, after));
}
replace('lib/erp/purchases.ts', "import {z} from 'zod';", "import {z} from 'zod';\nimport type {PurchaseCreditNote} from './purchase-credit-notes';");
replace('lib/erp/purchases.ts', "['suppliers','الموردون','supplier']", "['credit-notes','الإشعارات الدائنة','credit'],['suppliers','الموردون','supplier']");
replace('lib/erp/purchases.ts', 'allowDebitNotes:z.boolean(),', 'allowDebitNotes:z.boolean(),allowCreditNotes:z.boolean().optional(),');
replace('lib/erp/purchases.ts', 'export type PurchaseSnapshot={records:', 'export type PurchaseSnapshot={creditNotes?:PurchaseCreditNote[];records:');
replace('components/erp/purchases/settings.tsx', "['allowDebitNotes','تفعيل الإشعارات المدينة'],", "['allowDebitNotes','تفعيل الإشعارات المدينة'],['allowCreditNotes','تفعيل الإشعارات الدائنة للمشتريات'],");
replace('components/erp/purchases/settings.tsx', 'checked={v[key]}', 'checked={Boolean(v[key])}');
replace('components/erp/purchases/workspace.tsx', "import {SupplierStatement} from './statement';", "import {SupplierStatement} from './statement';\nimport {PurchaseCreditNotes} from './credit-notes';");
replace('components/erp/purchases/workspace.tsx', "{section==='settings'?", "{section==='credit-notes'?<PurchaseCreditNotes snapshot={snapshot} templates={templates}/>:section==='settings'?");
replace('components/erp/purchases/workspace.tsx', ' </main>;', " {section!=='credit-notes'&&invoice?.kind==='purchase'&&<PurchaseCreditNotes key={invoice.id} snapshot={snapshot} templates={templates} invoiceId={invoice.id}/>}\n </main>;");
replace('components/dashboard/integrated-system-navigation.ts', '{ label: "الإشعارات المدينة", href: "/dashboard/system/purchases/debit-notes" },', '{ label: "الإشعارات المدينة", href: "/dashboard/system/purchases/debit-notes" }, { label: "الإشعارات الدائنة", href: "/dashboard/system/purchases/credit-notes" },');
replace('lib/erp/settings-numbering.ts', 'export const systemNumberingContexts=[', "export const systemNumberingContexts=[\n ['purchase_credit_note','إشعار دائن مشتريات','erp_purchase_credit_notes','code',''],");
