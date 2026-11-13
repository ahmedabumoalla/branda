import type { InvoiceDetail } from "./invoice-management";

/** Copy archived invoice values into an unissued draft without touching the source. */
export function invoiceCopyPayload(detail: InvoiceDetail) {
  const invoice = detail.document, issued = detail.invoice;
  if (!invoice.lines.length || (!issued?.currency && invoice.lines.some(line => !line.product_id))) throw new Error("تحتاج بنود الفاتورة إلى أصناف مرتبطة قبل النسخ");
  if (issued?.currency) return {
    invoice: { lines: issued.lines.map((row, key) => ({ key, productId: row.productId ?? "", catalogSource: row.catalogSource, unitName: row.unitName, unitFactor: row.unitFactor, name: row.name, kind: row.kind ?? "product", quantity: row.quantity, price: row.price, description: row.description, discount: row.discount, discountKind: "amount", vatRate: row.vatRate ?? 15, taxCategory: row.taxCategory, exemptionReason: row.exemptionReason })), warehouseId: invoice.warehouse_id ?? "", partyId: invoice.party_id ?? "", accountId: "", paymentKind: "credit", discountValue: 0, discountKind: "amount", discountEnabled: false, vatRate: invoice.vat_rate ?? 15, taxInclusive: invoice.tax_inclusive ?? false, note: issued.note.slice(0, 500), currency: issued.currency, exchangeRate: issued.exchangeRate ?? 1, applyCredit: false, ...(issued.adjustment?.typeId ? { adjustment: { typeId: issued.adjustment.typeId, amount: issued.adjustment.amount } } : {}) },
    issuer: issued.seller, template: issued.template, deliveryMethod: "print", extraFields: issued.extraFields.map((field, key) => ({ ...field, key })),
    deposit: { kind: "amount", value: 0, paid: false }, shipping: "none", delivery: { confirmed: false, date: "" }, attachments: [],
  };
  const archived = [...(issued?.lines ?? [])];
  const lines = invoice.lines.map((line, key) => {
    const match = archived.findIndex(row => (!row.productId || row.productId === line.product_id) && row.name === line.name && row.quantity === line.quantity && row.price === line.unit_price && Math.abs(row.net - line.net) < .005 && Math.abs(row.tax - line.tax) < .005);
    if (issued && match < 0) throw new Error("تعذر مطابقة بنود الفاتورة للنسخ");
    const row = match >= 0 ? archived.splice(match, 1)[0] : undefined;
    return { key, productId: line.product_id ?? "", quantity: line.quantity, price: line.unit_price, description: row?.description ?? "", discount: row?.discount ?? 0, discountKind: "amount", vatRate: invoice.vat_rate ?? 15 };
  });
  return {
    invoice: { lines, warehouseId: invoice.warehouse_id ?? "", partyId: invoice.party_id ?? "", accountId: "", paymentKind: "credit", discountValue: issued ? 0 : invoice.discount, discountKind: "amount", discountEnabled: true, vatRate: invoice.vat_rate ?? 15, taxInclusive: invoice.tax_inclusive ?? false, note: (issued?.note ?? invoice.note).slice(0, 500) },
    ...(issued ? { issuer: { name: issued.seller.name, vatNumber: issued.seller.vatNumber, address: issued.seller.address } } : {}),
    template: issued?.template ?? "standard", deliveryMethod: "print", extraFields: (issued?.extraFields ?? []).map((field, key) => ({ ...field, key })),
    deposit: { kind: "amount", value: 0, paid: false }, shipping: "none", delivery: { confirmed: false, date: "" }, attachments: [],
  };
}
