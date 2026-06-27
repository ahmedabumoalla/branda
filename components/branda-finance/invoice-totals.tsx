type InvoiceTotalsProps = {
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
};

function money(value: number) {
  return `${value.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}

export function InvoiceTotals({ subtotal, discount, vat, total }: InvoiceTotalsProps) {
  return (
    <div className="rounded-2xl border border-[#E7D7C6] bg-[#FFFDF9] p-4">
      <div className="space-y-2 text-sm font-bold text-[#6B5548]">
        <Row label="الإجمالي قبل الضريبة" value={money(subtotal)} />
        <Row label="الخصم" value={money(discount)} />
        <Row label="ضريبة القيمة المضافة 15%" value={money(vat)} />
      </div>
      <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#3A2117] px-4 py-3 text-white">
        <span className="text-sm font-black">الإجمالي المستحق</span>
        <span className="text-xl font-black">{money(total)}</span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span>{label}</span>
      <span className="font-black text-[#311912]">{value}</span>
    </div>
  );
}
