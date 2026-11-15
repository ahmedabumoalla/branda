/** UX and server preflight only; PostgreSQL independently enforces this matrix. */
import type { EmployeePermissionKey, EmployeePermissions } from "./employee-permissions";
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
export function canFinance(role: string, capability: FinanceCapability, policy?: EmployeePermissions): boolean {
  if (role !== "owner" && policy && capability !== "staff_manage" && capability !== "settings_manage") {
    const keys: Partial<Record<FinanceCapability, EmployeePermissionKey[]>> = {
      dashboard: ["sales.read", "purchases.read", "suppliers.read", "inventory.read", "finance.read", "accounting.read", "reports.read", "shifts.read", "loyalty.read", "loyalty.settings"],
      reports: ["reports.read"], inventory_read: ["inventory.read"], inventory_write: ["inventory.create", "inventory.update", "inventory.delete", "inventory.approve"],
      accounting_write: ["accounting.create", "accounting.update", "accounting.delete", "accounting.approve"], treasury_write: ["finance.create", "finance.update", "finance.delete", "finance.approve"],
      shifts_read: ["shifts.read"], shifts_manage: ["shifts.approve"], pos: ["pos.read", "pos.create"],
    };
    return (keys[capability] ?? []).some(key => policy[key]?.enabled === true);
  }
  return Object.hasOwn(grants, role) && grants[role as FinanceRole].includes(capability);
}
const operations: Record<string, FinanceCapability> = {
  // Unpublished local operations retain their narrower downstream authorization.
  opening_balances: "settings_manage", shift_variance_settle: "settings_manage",
  shift_purchase: "pos", finance_reset: "shifts_manage",
  settings: "settings_manage", staff: "staff_manage",
  item: "inventory_write", warehouse: "inventory_write", stock_adjust: "inventory_write", stock_transfer: "inventory_write",
  purchase: "accounting_write", party: "accounting_write", account: "treasury_write", journal: "accounting_write", treasury: "treasury_write", settlement: "accounting_write",
  refund_approve: "settings_manage", refund_reject: "settings_manage",
  sale: "pos", shift_open: "pos", shift_close: "pos", shift_handover: "pos", shift_accept: "pos", supplier_payout: "pos",
};
export function canEmployeeAction(role: string, policy: EmployeePermissions | undefined, key: EmployeePermissionKey, legacy: boolean): boolean {
  return role === "owner" || (policy ? policy[key]?.enabled === true : legacy);
}
export function canFinanceOperation(role: string, operation: string, policy?: EmployeePermissions): boolean {
  if (role !== "owner" && policy) {
    if (operation === "sale") return policy["pos.create"].enabled && policy["sales.create"].enabled;
    const alternatives: Record<string, EmployeePermissionKey[]> = {
      item: ["inventory.create", "inventory.update"], warehouse: ["inventory.create", "inventory.update"],
      party: ["suppliers.create", "suppliers.update", "sales.create", "sales.update"],
      settlement: ["sales.pay", "suppliers.pay"], account: ["accounting.create", "accounting.update"],
    };
    if (alternatives[operation]) return alternatives[operation].some(key => policy[key]?.enabled);
    const keys: Record<string, EmployeePermissionKey> = {
      item: "inventory.create", warehouse: "inventory.settings", stock_adjust: "inventory.approve", stock_transfer: "inventory.approve",
      purchase: "purchases.create", shift_purchase: "purchases.create", party: "suppliers.create", account: "finance.create", journal: "accounting.create", treasury: "finance.create", settlement: "sales.pay",
      sale: "sales.create", refund: "sales.return", shift_open: "shifts.create", shift_close: "shifts.update", shift_handover: "shifts.update", shift_accept: "shifts.approve", supplier_payout: "suppliers.pay",
    };
    if (keys[operation]) return policy[keys[operation]]?.enabled === true;
  }
  if (operation === "refund") return canFinance(role, "accounting_write") || canFinance(role, "pos");
  return Object.hasOwn(operations, operation) && canFinance(role, operations[operation]);
}
