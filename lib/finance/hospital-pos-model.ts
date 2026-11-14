import type { HospitalOrder, HospitalOrderLine } from "@/lib/commerce/hospital-orders";
import type { FinanceAccount, FinanceShift } from "./brand-finance";

export function unseenHospitalMenuOrder(orders: HospitalOrder[], seen: ReadonlySet<string>) {
  return orders.find(order => order.source === "menu" && order.status === "pending" && !seen.has(order.id)) ?? null;
}

/** Preview validation only; the posting RPC independently checks every catalog price. */
export function hospitalPricesConfirmed(items: HospitalOrderLine[], values: string[]) {
  return values.length === items.length && items.length > 0 && items.every((item, index) => {
    const raw = values[index]?.trim(), value = Number(raw);
    return raw !== "" && raw !== undefined && Number.isFinite(value) && value >= item.unitPrice && value <= item.maxUnitPrice && Math.abs(value * 100 - Math.round(value * 100)) < .000001;
  });
}

export function hospitalCheckoutAccounts(accounts: FinanceAccount[], method: "cash" | "card" | "credit", shift?: FinanceShift) {
  if (method === "credit") return [];
  return accounts.filter(account => account.active && (method === "cash" ? !!shift && shift.status === "open" && !shift.supervisor_paused && account.kind === "cash" && account.id === shift.account_id : account.kind === "pos"));
}
