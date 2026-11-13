export const systemNumberingContexts=[
 ['contracting_advance_invoice','فاتورة دفعة مقدمة','bf_invoice_extensions','display_number',''],
 ['sales_quote','عروض الأسعار','bf_quotes','displayNumber',''],['sales_credit_note','الإشعار الدائن','bf_credit_notes','displayNumber',''],['contracting_reverse_certificate','المستخلص العكسي','erp_contracting_documents','number','kind=reverse_certificate'],
 ['purchase_credit_note','إشعار دائن مشتريات','erp_purchase_credit_notes','code',''],
 ['customer','العميل','erp_customer_profiles','code',''],['supplier','المورد','erp_purchase_suppliers','payload.code',''],
 ['expense','مصروف','erp_finance_vouchers','code','kind=expense'],['receipt','سند قبض','erp_finance_vouchers','code','kind=receipt'],
 ['inventory_receipt','إذن إضافة مخزن','erp_inventory_documents','code','kind=receipt'],['inventory_issue','إذن صرف مخزن','erp_inventory_documents','code','kind=issue'],['inventory_transfer','إذن تحويل مخزني','erp_inventory_documents','code','kind=transfer'],['inventory_stocktake','ورق الجرد','erp_inventory_documents','code','kind=stocktake'],
 ['product','المنتجات','bf_items','sku',''],['purchase_request','طلب الشراء','erp_purchase_documents','number','kind=request'],['purchase_rfq','طلب عرض أسعار','erp_purchase_documents','number','kind=rfq'],['purchase_quotation','عرض سعر مشتريات','erp_purchase_documents','number','kind=quotation'],['purchase_order','أمر شراء','erp_purchase_documents','number','kind=order'],['purchase_invoice','فاتورة شراء','erp_purchase_documents','number','kind=invoice'],
 ['asset','أصل','erp_assets','code',''],['routing','مسارات الإنتاج','erp_mfg_routings','code',''],['workstation','محطات العمل','erp_mfg_workstations','code',''],['bom','قوائم مواد الإنتاج','erp_mfg_boms','code',''],['manufacturing_order','أوامر التصنيع','erp_mfg_orders','code',''],['manufacturing_plan','خطة إنتاج','erp_mfg_plans','code',''],
 ['employee','الموظفون','erp_hr_employees','code',''],['rental_contract','عقود الإيجار','erp_rental_contracts','code',''],['contracting_bid','المناقصات','erp_contracting_documents','number','kind=bid'],['contracting_work_item','قالب بند أعمال','erp_contracting_documents','number','kind=work_item'],['contracting_cost_sheet','جداول التكاليف','erp_contracting_documents','number','kind=cost_sheet'],['contracting_quotation','عروض أسعار المقاولات','erp_contracting_documents','number','kind=quotation'],['contracting_project','مشاريع المقاولات','erp_contracting_documents','number','kind=project'],['contracting_contract','عقود المقاولات','erp_contracting_documents','number','kind=contract'],['contracting_certificate','المستخلصات','erp_contracting_documents','number','kind=certificate'],
 ['work_order','أمر الشغل','erp_work_orders','code',''],['employee_asset','أصول الموظفين','erp_employee_assets','code',''],['custody','عهد الموظفين','erp_finance_custodies','code',''],['task','مهمة','erp_tasks','code',''],['task_flow','مسار المهام','erp_task_flows','code',''],['workflow','دورة العمل','erp_workflow_records','code',''],['payroll_contract','عقود المرتبات','erp_payroll_records','code','kind=contract']
, ["booking","حجز","erp_bookings","displayNumber",""],
 ["rental_reservation","أمر الحجز","erp_rental_reservations","displayNumber",""],
 ["branch","الفروع","erp_branch_details","code",""],
 ["task_template","قالب مهمة","erp_task_templates","displayNumber",""],
 ["manual_journal","قيد يدوي","bf_gl_drafts","displayNumber",""],
 ["automatic_journal","قيد تلقائي","bf_documents","displayNumber","kind=journal"],
 ["purchase_return","مرتجع مشتريات","bf_documents","displayNumber","kind=refund"],
 ["purchase_debit","الإشعارات المدينة للمشتريات","bf_documents","displayNumber","kind=refund"],
 ["sales_return","فاتورة مرتجعة","bf_documents","displayNumber","kind=refund"],
 ["invoice_payment","مدفوعات الفواتير","bf_documents","displayNumber","kind=settlement"],
 ["purchase_payment","دفع فاتورة الشراء","bf_documents","displayNumber","kind=settlement"],
 ["refund_payment","دفع مبلغ مرتجع","bf_documents","displayNumber","kind=refund"],
 ["purchase_return_payment","مدفوعات مرتجع المشتريات","bf_documents","displayNumber","kind=refund"],
 ["custody_settlement","تسوية العهدة","erp_finance_custody_movements","displayNumber","kind=settlement"]
] as const;

export function displayRecordNumber(record:unknown,fallback:string|number=""):string|number{if(!record||typeof record!=="object")return fallback;const row=record as Record<string,unknown>;return typeof row.displayNumber==="string"&&row.displayNumber?row.displayNumber:typeof row.number==="string"||typeof row.number==="number"?row.number:typeof row.code==="string"?row.code:fallback;}
