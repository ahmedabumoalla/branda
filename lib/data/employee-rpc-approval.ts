import "server-only";
import type { createClient } from "@/lib/supabase/server";

// Database wrappers independently enforce the same permissions for direct callers
// Preflight commits a pending request before a protected write is attempted
const guarded = new Set([
  "brand_finance_execute", "erp_purchases_write", "erp_finance_write", "erp_accounting_write", "erp_inventory_write",
  "brand_finance_treasury_execute", "brand_finance_issue_company_invoice", "brand_finance_save_invoice_draft",
  "brand_finance_invoice_management", "brand_finance_amend_invoice", "brand_finance_customer_credit",
  "brand_finance_sales_return_stock", "brand_finance_inventory_unit_save", "erp_purchase_product_create", "finance_loyalty_settings_save",
  "brand_finance_gl_execute", "brand_finance_save_credit_note", "brand_finance_transition_credit_note", "brand_finance_invoice_extensions",
]);
type Client = Awaited<ReturnType<typeof createClient>>;
export function withEmployeeApproval(client: Client, cafeId: string, needed: boolean): Client {
  if (!needed) return client;
  return new Proxy(client, {
    get(target, key, receiver) {
      if (key !== "rpc") return Reflect.get(target, key, receiver);
      return (name: string, args: Record<string, unknown> = {}, options?: object) => {
        const branch = name === "erp_branch_execute";
        const operation = branch ? String(args.p_function) : name;
        if (!guarded.has(operation)) return target.rpc(name, args, options);
        return (async () => {
          const prepared = await target.rpc("brand_finance_approval_prepare_rpc", {
            p_cafe_id: cafeId, p_function: operation, p_arguments: branch ? args.p_arguments : args,
            p_scope: branch ? args.p_scope : null,
          });
          if (prepared.error) return prepared;
          if (prepared.data?.status !== "ready") return { data: null, error: {
            code: "P0001", details: "", hint: "", message: prepared.data?.status === "rejected"
              ? "رُفض طلب اعتماد هذه العملية راجع ملاحظة المعتمد في طلبات الاعتماد"
              : "أُرسل الطلب لمسؤول الاعتماد بعد الموافقة أعد تنفيذ العملية بنفس البيانات من هذه الشاشة",
          }, count: null, status: 409, statusText: "Approval required" };
          return target.rpc("brand_finance_employee_rpc_execute", {
            p_cafe_id: cafeId, p_function: operation, p_arguments: branch ? args.p_arguments : args,
            p_request_id: prepared.data.requestId, p_scope: branch ? args.p_scope : null,
          });
        })();
      };
    },
  });
}
