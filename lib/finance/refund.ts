import type { FinanceDocument, FinanceSnapshot } from "./brand-finance";

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function refundPreview(document: FinanceDocument, quantities: Record<string, number>) {
  const lines = document.lines.map(line => {
    const quantity = quantities[line.id] ?? 0, returned = line.returned_quantity ?? 0;
    const net = quantity > 0 ? round(line.net * (returned + quantity) / line.quantity) - (line.returned_net ?? 0) : 0;
    const tax = quantity > 0 ? round(line.tax * (returned + quantity) / line.quantity) - (line.returned_tax ?? 0) : 0;
    return { line, quantity, available: Math.max(0, line.quantity - returned), net: round(net), tax: round(tax), total: round(net + tax) };
  });
  const total = round(lines.reduce((sum, line) => sum + line.total, 0));
  const debt = Math.min(total, document.outstanding);
  return { lines, total, tax: round(lines.reduce((sum, line) => sum + line.tax, 0)), debt, paid: round(total - debt) };
}

export function refundPayload(document: FinanceDocument, quantities: Record<string, number>, accountId: string, note: string, snapshot: Pick<FinanceSnapshot, "canManage" | "accounts" | "shifts">, shiftId = "", deferStock = false) {
  if ((!snapshot.canManage && document.kind !== "sale") || !["sale", "purchase"].includes(document.kind) || document.refunded) throw new Error("الفاتورة غير متاحة للإرجاع");
  const preview = refundPreview(document, quantities);
  for (const row of preview.lines) if (!Number.isFinite(row.quantity) || row.quantity < 0 || row.quantity > row.available || Math.abs(row.quantity * 1000 - Math.round(row.quantity * 1000)) > .000001) throw new Error("راجع الكمية المرتجعة لكل صنف");
  const lines = preview.lines.filter(row => row.quantity > 0).map(row => ({ lineId: row.line.id, quantity: row.quantity, expectedReturnedQuantity: row.line.returned_quantity ?? 0 }));
  if (!lines.length) throw new Error("حدد كمية صنف واحد على الأقل للإرجاع");
  if (!note.trim()) throw new Error("أدخل سبب المرتجع");
  const account = snapshot.accounts.find(account => account.id === accountId && account.active && (document.kind === "sale" ? ["cash", "bank"] : ["cash", "bank", "pos"]).includes(account.kind));
  if (preview.paid > 0 && !account) throw new Error("اختر حساب تسوية المبلغ المرتجع");
  if (preview.paid > 0 && shiftId && !snapshot.shifts.some(shift => shift.id === shiftId && shift.status === "open" && shift.account_id === accountId)) throw new Error("اختر وردية مفتوحة مرتبطة بالصندوق المحدد");
  if (document.kind === "sale" && preview.paid > 0 && account?.kind === "cash" && snapshot.shifts.some(shift => shift.account_id === accountId && shift.status === "open") && !shiftId) throw new Error("اختر عهدة الوردية المفتوحة لهذا الصندوق");
  return { documentId: document.id, lines, expectedTotal: preview.total, expectedPaid: preview.paid, ...(document.kind === "sale" && deferStock ? { deferStock: true } : {}), ...(preview.paid > 0 ? { accountId, paymentMethod: account!.kind, ...(shiftId ? { shiftId } : {}) } : {}), note: note.trim() };
}
