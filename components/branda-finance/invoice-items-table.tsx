import { Plus, Trash2 } from "lucide-react";
import { formatFinanceAmount, lineTotal, lineVat } from "@/components/branda-finance/invoice-totals";
import type {
  FinanceAccount,
  FinanceInvoiceItem,
  FinanceProduct,
  FinanceTaxRate,
  FinanceWarehouse,
} from "@/lib/branda-finance/invoice-types";

type InvoiceItemsTableProps = {
  items: FinanceInvoiceItem[];
  products: FinanceProduct[];
  accounts: FinanceAccount[];
  warehouses: FinanceWarehouse[];
  taxRates: FinanceTaxRate[];
  onChangeItem: (id: string, patch: Partial<FinanceInvoiceItem>) => void;
  onAddItem: () => void;
  onRemoveItem: (id: string) => void;
  onOpenProductModal?: () => void;
};

export function InvoiceItemsTable({
  items,
  products,
  accounts,
  warehouses,
  taxRates,
  onChangeItem,
  onAddItem,
  onRemoveItem,
  onOpenProductModal,
}: InvoiceItemsTableProps) {
  return (
    <div className="w-full max-w-full min-w-0 overflow-hidden rounded-[8px] border border-[#E1D1BD] bg-white shadow-[0_10px_24px_rgba(69,43,28,0.06)]">
      <div className="flex min-w-0 flex-col gap-2 border-b border-[#EFE3D2] bg-[#FFFDF8] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-[13px] font-black text-[#2F241D]">بنود الفاتورة والمنتجات</h3>
          <p className="mt-1 truncate text-[11px] font-bold text-[#806A58]">اختيار المنتج وتعديل الكمية والسعر والضريبة والحساب داخل جدول محصور.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {onOpenProductModal ? (
            <button
              type="button"
              onClick={onOpenProductModal}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] border border-[#CFE2D8] bg-[#EDF7F2] px-3 text-[11px] font-black text-[#2F5D50] transition hover:bg-[#DDEFE7]"
            >
              <Plus className="h-4 w-4" />
              إضافة منتج جديد
            </button>
          ) : null}
          <button
            type="button"
            onClick={onAddItem}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] border border-[#D6B677] bg-[#F8E8C9] px-3 text-[11px] font-black text-[#6B431C] transition hover:bg-[#F1D9A8]"
          >
            <Plus className="h-4 w-4" />
            إضافة بند
          </button>
        </div>
      </div>
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[1180px] table-fixed text-right text-[12px]">
          <colgroup>
            <col className="w-[320px]" />
            <col className="w-[82px]" />
            <col className="w-[105px]" />
            <col className="w-[105px]" />
            <col className="w-[130px]" />
            <col className="w-[160px]" />
            <col className="w-[170px]" />
            <col className="w-[130px]" />
            <col className="w-[62px]" />
          </colgroup>
          <thead className="bg-[#F4E8D8] text-xs font-black text-[#674C38]">
            <tr>
              <th className="px-2.5 py-2.5">المنتج / الوصف</th>
              <th className="px-2.5 py-2.5">الكمية</th>
              <th className="px-2.5 py-2.5">السعر</th>
              <th className="px-2.5 py-2.5">الخصم</th>
              <th className="px-2.5 py-2.5">الضريبة</th>
              <th className="px-2.5 py-2.5">المستودع</th>
              <th className="px-2.5 py-2.5">الحساب</th>
              <th className="px-2.5 py-2.5">الإجمالي</th>
              <th className="px-2.5 py-2.5" aria-label="إجراء" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFE3D2]">
            {items.map((item) => {
              const selectedProduct = products.find((product) => product.id === item.productId);

              return (
                <tr key={item.id} className="align-top transition hover:bg-[#FFF8EA]">
                  <td className="px-2.5 py-2.5">
                    <select
                      value={item.productId ?? ""}
                      onChange={(event) => {
                        const product = products.find((candidate) => candidate.id === event.target.value);
                        if (!product) return;
                        onChangeItem(item.id, {
                          productId: product.id,
                          description: product.name,
                          price: product.price,
                          taxRate: product.vatRate,
                          accountId: product.accountId,
                          revenueRecognition: product.revenueRecognition,
                        });
                      }}
                      className="mb-1.5 h-9 w-full min-w-0 rounded-[8px] border border-[#E1D1BD] bg-[#FFFDF8] px-2 text-[12px] font-bold outline-none transition focus:border-[#B88334] focus:ring-2 focus:ring-[#D9A33F]/20"
                    >
                      <option value="">اختر صنفًا</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} - {product.sku} - {product.barcode}
                        </option>
                      ))}
                    </select>
                    <input
                      value={item.description}
                      onChange={(event) => onChangeItem(item.id, { description: event.target.value })}
                      className="h-9 w-full min-w-0 rounded-[8px] border border-[#E1D1BD] px-2 text-[12px] font-bold outline-none transition focus:border-[#B88334] focus:ring-2 focus:ring-[#D9A33F]/20"
                      placeholder="وصف البند"
                    />
                    {selectedProduct ? (
                      <div className="mt-2 flex min-w-0 gap-2 rounded-[8px] border border-[#EFE3D2] bg-[#FAF3E8] p-2 text-[10px] font-bold leading-4 text-[#735A45]">
                        {selectedProduct.imageUrl ? (
                          <img src={selectedProduct.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-[8px] object-cover" loading="lazy" />
                        ) : null}
                        <div className="min-w-0">
                          <p className="truncate">{selectedProduct.category}</p>
                          <p dir="ltr">SKU {selectedProduct.sku}</p>
                          <p dir="ltr">Barcode {selectedProduct.barcode}</p>
                          <p dir="ltr">{formatFinanceAmount(selectedProduct.price)} / VAT {selectedProduct.vatRate}%</p>
                        </div>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2.5 py-2.5">
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(event) => onChangeItem(item.id, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                      className="h-9 w-full min-w-0 rounded-[8px] border border-[#E1D1BD] px-1.5 text-center text-[12px] font-black outline-none transition focus:border-[#B88334] focus:ring-2 focus:ring-[#D9A33F]/20"
                    />
                  </td>
                  <td className="px-2.5 py-2.5">
                    <input
                      type="number"
                      min="0"
                      value={item.price}
                      onChange={(event) => onChangeItem(item.id, { price: Math.max(0, Number(event.target.value) || 0) })}
                      className="h-9 w-full min-w-0 rounded-[8px] border border-[#E1D1BD] px-1.5 text-center text-[12px] font-black outline-none transition focus:border-[#B88334] focus:ring-2 focus:ring-[#D9A33F]/20"
                    />
                  </td>
                  <td className="px-2.5 py-2.5">
                    <input
                      type="number"
                      min="0"
                      value={item.discount}
                      onChange={(event) => onChangeItem(item.id, { discount: Math.max(0, Number(event.target.value) || 0) })}
                      className="h-9 w-full min-w-0 rounded-[8px] border border-[#E1D1BD] px-1.5 text-center text-[12px] font-black outline-none transition focus:border-[#B88334] focus:ring-2 focus:ring-[#D9A33F]/20"
                    />
                  </td>
                  <td className="px-2.5 py-2.5">
                    <select
                      value={String(item.taxRate)}
                      onChange={(event) => onChangeItem(item.id, { taxRate: Number(event.target.value) })}
                      className="h-9 w-full min-w-0 rounded-[8px] border border-[#E1D1BD] bg-white px-1.5 text-[11px] font-bold outline-none transition focus:border-[#B88334] focus:ring-2 focus:ring-[#D9A33F]/20"
                    >
                      {taxRates.map((taxRate) => (
                        <option key={taxRate.id} value={taxRate.rate}>
                          {taxRate.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-[11px] font-black text-[#2F5D50]" dir="ltr">
                      {formatFinanceAmount(lineVat(item))}
                    </p>
                  </td>
                  <td className="px-2.5 py-2.5">
                    <select
                      value={item.warehouseId ?? warehouses[0]?.id ?? ""}
                      onChange={(event) => onChangeItem(item.id, { warehouseId: event.target.value })}
                      className="h-9 w-full min-w-0 rounded-[8px] border border-[#E1D1BD] bg-white px-1.5 text-[11px] font-bold outline-none transition focus:border-[#B88334] focus:ring-2 focus:ring-[#D9A33F]/20"
                    >
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2.5 py-2.5">
                    <select
                      value={item.accountId}
                      onChange={(event) => onChangeItem(item.id, { accountId: event.target.value })}
                      className="h-9 w-full min-w-0 rounded-[8px] border border-[#E1D1BD] bg-white px-1.5 text-[11px] font-bold outline-none transition focus:border-[#B88334] focus:ring-2 focus:ring-[#D9A33F]/20"
                    >
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2.5 py-2.5 text-[12px] font-black text-[#2F241D]" dir="ltr">
                    {formatFinanceAmount(lineTotal(item))}
                  </td>
                  <td className="px-2.5 py-2.5">
                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#E6CFC8] bg-[#FFF7F4] text-[#9B3327] transition hover:bg-[#FBE5DF]"
                      title="حذف البند"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-[#EFE3D2] bg-[#FFFDF8] p-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onAddItem}
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#D6B677] bg-[#F8E8C9] px-3 text-[11px] font-black text-[#6B431C] transition hover:bg-[#F1D9A8]"
          >
            <Plus className="h-4 w-4" />
            إضافة بند
          </button>
          {onOpenProductModal ? (
            <button
              type="button"
              onClick={onOpenProductModal}
              className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#CFE2D8] bg-[#EDF7F2] px-3 text-[11px] font-black text-[#2F5D50] transition hover:bg-[#DDEFE7]"
            >
              <Plus className="h-4 w-4" />
              إضافة منتج جديد
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
