import { Plus, Trash2 } from "lucide-react";
import type {
  BrandaFinanceAccount,
  BrandaFinanceInvoiceLine,
  BrandaFinanceProduct,
  BrandaFinanceTaxRate,
} from "@/lib/branda-finance/invoice-types";

type InvoiceItemsTableProps = {
  lines: BrandaFinanceInvoiceLine[];
  products: BrandaFinanceProduct[];
  accounts: BrandaFinanceAccount[];
  taxRates: BrandaFinanceTaxRate[];
  onChangeLine: (lineId: string, patch: Partial<BrandaFinanceInvoiceLine>) => void;
  onAddLine: () => void;
  onRemoveLine: (lineId: string) => void;
};

export function InvoiceItemsTable({
  lines,
  products,
  accounts,
  taxRates,
  onChangeLine,
  onAddLine,
  onRemoveLine,
}: InvoiceItemsTableProps) {
  function selectProduct(lineId: string, productId: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    onChangeLine(lineId, {
      productId,
      description: product.name,
      unitPrice: product.price,
      taxRateId: product.taxRateId,
      accountId: product.accountId,
    });
  }

  return (
    <div className="rounded-2xl border border-[#E7D7C6] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#E7D7C6] p-4">
        <div>
          <h3 className="font-black text-[#311912]">الأصناف</h3>
          <p className="text-xs font-bold text-[#806A5E]">بحث واختيار من منتجات المنيو أو إدخال وصف يدوي.</p>
        </div>
        <button
          type="button"
          onClick={onAddLine}
          className="inline-flex items-center gap-2 rounded-2xl bg-[#3A2117] px-4 py-2 text-sm font-black text-white"
        >
          <Plus className="h-4 w-4" />
          إضافة صنف
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-[#F8F1E7] text-[#3A2117]">
            <tr>
              <Th>الوصف / البحث عن الأصناف</Th>
              <Th>الكمية</Th>
              <Th>السعر</Th>
              <Th>معدل ضريبي</Th>
              <Th>الحساب</Th>
              <Th>الاعتراف بالإيرادات</Th>
              <Th>حذف</Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-t border-[#F0E5DA]">
                <Td>
                  <div className="grid gap-2">
                    <input
                      list={`products-${line.id}`}
                      value={line.description}
                      onChange={(event) => onChangeLine(line.id, { description: event.target.value })}
                      className="h-10 rounded-xl border border-[#E7D7C6] bg-[#FCF8F3] px-3 font-bold outline-none"
                    />
                    <datalist id={`products-${line.id}`}>
                      {products.map((product) => (
                        <option key={product.id} value={product.name} />
                      ))}
                    </datalist>
                    <select
                      value={line.productId ?? ""}
                      onChange={(event) => selectProduct(line.id, event.target.value)}
                      className="h-9 rounded-xl border border-[#E7D7C6] bg-white px-2 text-xs font-bold"
                    >
                      <option value="">ربط منتج</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} - {product.sku}
                        </option>
                      ))}
                    </select>
                  </div>
                </Td>
                <Td>
                  <NumberInput value={line.quantity} min={1} onChange={(quantity) => onChangeLine(line.id, { quantity })} />
                </Td>
                <Td>
                  <NumberInput value={line.unitPrice} min={0} onChange={(unitPrice) => onChangeLine(line.id, { unitPrice })} />
                </Td>
                <Td>
                  <Select value={line.taxRateId} onChange={(taxRateId) => onChangeLine(line.id, { taxRateId })}>
                    {taxRates.map((rate) => (
                      <option key={rate.id} value={rate.id}>
                        {rate.name}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td>
                  <Select value={line.accountId} onChange={(accountId) => onChangeLine(line.id, { accountId })}>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td>
                  <Select value={line.revenueRecognition} onChange={(revenueRecognition) => onChangeLine(line.id, { revenueRecognition })}>
                    <option value="on-invoice">عند إصدار الفاتورة</option>
                    <option value="on-payment">عند الدفع</option>
                    <option value="deferred">مؤجل</option>
                  </Select>
                </Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => onRemoveLine(line.id)}
                    className="rounded-xl bg-[#F8F1E7] p-2 text-[#6B3A25]"
                    aria-label="حذف الصنف"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="p-3 text-right font-black">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="p-2 align-top">{children}</td>;
}

function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-xl border border-[#E7D7C6] bg-[#FCF8F3] px-2 font-bold outline-none">
      {children}
    </select>
  );
}

function NumberInput({ value, min, onChange }: { value: number; min: number; onChange: (value: number) => void }) {
  return (
    <input
      type="number"
      min={min}
      value={value}
      onChange={(event) => onChange(Number(event.target.value) || min)}
      className="h-10 w-24 rounded-xl border border-[#E7D7C6] bg-[#FCF8F3] px-2 font-bold outline-none"
    />
  );
}
