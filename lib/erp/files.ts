import { z } from "zod";
export const ERP_FILE_BUCKET = "erp-record-files";
export const ERP_FILE_MAX = 5 * 1024 * 1024;
export const erpFileEntitySchema = z.enum(['customer_form_entry','manufacturing_form_entry','contracting_form_entry','branch','request_record','request_type','cheque','finance_voucher','financial_custody',"insurance_company", "purchase_document", "supplier_profile", "inventory_document", "inventory_item", "inventory_catalog", "journal_draft", "customer_profile", "payroll_record", "task","task_flow","manufacturing_order","manufacturing_plan","manufacturing_bom","manufacturing_workstation","manufacturing_routing","manufacturing_overhead","booking","contracting_document","asset","document_template","rental_reservation","rental_contract","work_order", "workflow_record", "workflow_child","hr_employee","employee_asset","attendance_leave","attendance_sheet","attendance_session"]);
export type ErpFileEntity = z.infer<typeof erpFileEntitySchema>;
export const erpFileSchema = z.object({ id: z.uuid(), entity_type: erpFileEntitySchema, record_id: z.uuid(), name: z.string(), mime: z.string(), size_bytes: z.number().int(), path: z.string(), uploaded: z.boolean(), created_at: z.string(), sha256: z.string().optional() });
export type ErpFile = z.infer<typeof erpFileSchema>;
