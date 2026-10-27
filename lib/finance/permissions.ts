/** UX and server preflight only; PostgreSQL independently enforces this matrix. */
export const financeStaffRoles = ["manager", "accountant", "warehouse", "auditor", "cashier"] as const;
export type FinanceStaffRole = typeof financeStaffRoles[number];
export type FinanceRole = "owner" | FinanceStaffRole;
export const financeRoleLabels: Record<FinanceRole, string> = {
  owner: "المالك", manager: "مدير التشغيل", accountant: "المحاسب",
  warehouse: "أمين المستودع", auditor: "المراجع", cashier: "الكاشير",
};
export type FinanceCapability = "dashboard" | "reports" | "inventory_read" | "inventory_write" | "accounting_write" | "treasury_write" | "shifts_read" | "shifts_manage" | "staff_manage" | "settings_manage" | "pos";
const grants: Record<FinanceRole, readonly FinanceCapability[]> = {
  owner: ["dashboard", "reports", "inventory_read", "inventory_write", "accounting_write", "treasury_write", "shifts_read", "shifts_manage", "staff_manage", "settings_manage", "pos"],
  manager: ["dashboard", "reports", "inventory_read", "inventory_write", "accounting_write", "treasury_write", "shifts_read", "shifts_manage", "pos"],
  accountant: ["dashboard", "reports", "inventory_read", "accounting_write", "treasury_write", "shifts_read"],
  warehouse: ["dashboard", "inventory_read", "inventory_write"],
  auditor: ["dashboard", "reports", "inventory_read", "shifts_read"],
  cashier: ["pos"],
};
export function canFinance(role: string, capability: FinanceCapability): boolean {
  return Object.hasOwn(grants, role) && grants[role as FinanceRole].includes(capability);
}
const operations: Record<string, FinanceCapability> = {
  settings: "settings_manage", staff: "staff_manage",
  item: "inventory_write", warehouse: "inventory_write", stock_adjust: "inventory_write", stock_transfer: "inventory_write",
  purchase: "accounting_write", party: "accounting_write", account: "treasury_write", journal: "accounting_write", treasury: "treasury_write", settlement: "accounting_write",
  refund_approve: "settings_manage", refund_reject: "settings_manage",
  sale: "pos", shift_open: "pos", shift_close: "pos", shift_handover: "pos", shift_accept: "pos", supplier_payout: "pos", shift_purchase: "pos",
};
export function canFinanceOperation(role: string, operation: string): boolean {
  if (operation === "refund") return canFinance(role, "accounting_write") || canFinance(role, "pos");
  return Object.hasOwn(operations, operation) && canFinance(role, operations[operation]);
}
