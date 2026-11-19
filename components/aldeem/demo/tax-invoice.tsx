"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, Download, FileCode2, Printer, Send, ShieldCheck } from "lucide-react";
import type { Line, Row } from "./data";
import { Badge, Trace, today, useToast, type TraceStep } from "./kit";
import { clock, useDemo } from "./store";
import s from "./demo.module.css";

const sar = (value: number) => `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
// Deterministic demo fingerprints: they only look like hashes, nothing here is signed or sent anywhere.
const hex = (seed: string, length: number) => { let h = 2166136261; let out = ""; for (let i = 0; out.length < length; i++) { h ^= seed.charCodeAt(i % seed.length) + i; h = Math.imul(h, 16777619) >>> 0; out += h.toString(16).padStart(8, "0"); } return out.slice(0, length); };
const uuid = (seed: string) => { const v = hex(seed, 32); return `${v.slice(0, 8)}-${v.slice(8, 12)}-4${v.slice(13, 16)}-a${v.slice(17, 20)}-${v.slice(20, 32)}`; };

/** Opens the tax invoice for any record that is an invoice or points at one; other records keep their normal page. */
export function invoiceView(row: Row, back: () => void): ReactNode | null {
  const no = String(row.no ?? "").startsWith("INV") ? String(row.no) : String(row.invoice ?? "").startsWith("INV") ? String(row.invoice) : "";
  return no ? <TaxInvoice no={no} hint={row} back={back} /> : null;
}

function Qr({ seed }: { seed: string }) {
  const bits = hex(seed, 120);
  const finder = (r: number, c: number) => { const inBox = (r0: number, c0: number) => r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7; const box = inBox(0, 0) ? [0, 0] : inBox(0, 14) ? [0, 14] : inBox(14, 0) ? [14, 0] : null; if (!box) return null; const y = r - box[0], x = c - box[1]; return y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4); };
  return <div className={s.qr} aria-hidden="true">{Array.from({ length: 441 }, (_, i) => { const r = Math.floor(i / 21), c = i % 21; const f = finder(r, c); const on = f ?? (parseInt(bits[(i * 7) % bits.length], 16) + r + c) % 2 === 0; return <i key={i} className={on ? s.qrOn : ""} />; })}</div>;
}

function TaxInvoice({ no, hint, back }: { no: string; hint: Row; back: () => void }) {
  const { d, records, workshopInvoices, log } = useDemo();
  const toast = useToast();
  const [actions, setActions] = useState<TraceStep[]>([]);
  const found = [...records.sale, ...workshopInvoices, ...d.invoices].find(row => row.no === no);
  const seed = Number(no.replace(/\D/g, "")) || 7;
  // A ledger line may point at an invoice outside the visible register; its document is rebuilt the same way every time.
  const lines: Line[] = found?.lines ?? Array.from({ length: 2 + seed % 3 }, (_, i) => { const p = d.products[(seed * 3 + i * 11) % d.products.length]; return { name: p.name, qty: 1 + (seed + i) % 3, unit: p.unit, price: p.price }; });
  const row = found ?? hint;
  const kind = String(found?.type ?? "نقطة بيع");
  const standard = kind !== "نقطة بيع";
  const branch = String(row.branch ?? row.place ?? d.branches[0].name);
  const date = String(row.date ?? today());
  const time = `${String(9 + seed % 12).padStart(2, "0")}:${String(seed * 7 % 60).padStart(2, "0")}`;
  const net = lines.reduce((total, line) => total + line.qty * line.price, 0);
  const adjust = found ? Math.round((Number(found.total) - net * 1.15) * 100) / 100 : 0;
  const total = found ? Number(found.total) : Math.round(net * 115) / 100;
  const vat = Math.round(net * 15) / 100;
  const hash = hex(`${no}|${total}`, 64);
  const previous = hex(`INV-${seed - 1}`, 64);
  const act = (title: string, message: string) => { setActions(current => [...current, { title, meta: `${today()} ${clock()} · مالك الحساب` }]); log(`${title} للفاتورة ${no}`); toast(message); };
  const phaseOne = ["ترقيم تسلسلي لا يتكرر ولا يعدل", "الحقول الإلزامية للفاتورة الضريبية مكتملة", "رمز QR مطبوع على الفاتورة", "منع الحذف والتعديل بعد الإصدار", "حفظ إلكتروني مع سجل لكل عملية"];
  return <>
    <button type="button" className={s.back} onClick={back}><ArrowRight size={16} aria-hidden="true" />العودة</button>
    <div className={s.actions}>
      <button type="button" className={s.primary} onClick={() => act("طُبعت الفاتورة", "أُرسلت الفاتورة الضريبية للطابعة")}><Printer size={15} aria-hidden="true" />طباعة</button>
      <button type="button" className={s.ghost} onClick={() => act("نُزلت نسخة PDF", "جُهزت نسخة PDF مع ملف XML مضمن")}><Download size={15} aria-hidden="true" />تنزيل PDF</button>
      <button type="button" className={s.ghost} onClick={() => act("نُزل ملف XML", "جُهز ملف XML للفاتورة")}><FileCode2 size={15} aria-hidden="true" />تنزيل XML</button>
      <button type="button" className={s.ghost} onClick={() => act("أُرسلت للعميل", "أُرسلت الفاتورة للعميل على واتساب في العرض التجريبي")}><Send size={15} aria-hidden="true" />إرسال للعميل</button>
    </div>
    <div className={s.taxSplit}>
      <article className={`${s.paper} ${s.paperWide}`} aria-label="الفاتورة الضريبية">
        <header><div><strong>الديم للحلويات</strong><small>{standard ? "فاتورة ضريبية" : "فاتورة ضريبية مبسطة"} · {kind}</small></div><Qr seed={hash} /></header>
        <div className={s.taxParties}>
          <dl><div><dt>البائع</dt><dd>سلسلة خيال الديم للحلويات</dd></div><div><dt>الرقم الضريبي التجريبي</dt><dd><bdi>300000000000003</bdi></dd></div><div><dt>السجل التجاري التجريبي</dt><dd><bdi>1010000000</bdi></dd></div><div><dt>العنوان</dt><dd>{branch} · المملكة العربية السعودية</dd></div></dl>
          <dl><div><dt>العميل</dt><dd>{String(row.customer ?? "عميل نقدي")}</dd></div>{standard && <div><dt>الرقم الضريبي للعميل</dt><dd><bdi>3{hex(no, 13).replace(/[a-f]/g, "0")}3</bdi> تجريبي</dd></div>}<div><dt>رقم الفاتورة</dt><dd><bdi>{no}</bdi></dd></div><div><dt>تاريخ ووقت الإصدار</dt><dd><bdi>{date} {time}</bdi></dd></div><div><dt>تاريخ التوريد</dt><dd><bdi>{date}</bdi></dd></div></dl>
        </div>
        <table><thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الخاضع للضريبة</th><th>نسبة الضريبة</th><th>مبلغ الضريبة</th><th>الإجمالي شامل الضريبة</th></tr></thead>
          <tbody>{lines.map((line, i) => { const amount = line.qty * line.price; return <tr key={i}><td>{line.name}</td><td><bdi>{line.qty}</bdi> {line.unit}</td><td><bdi>{sar(line.price)}</bdi></td><td><bdi>{sar(amount)}</bdi></td><td><bdi>15%</bdi></td><td><bdi>{sar(amount * 0.15)}</bdi></td><td><bdi>{sar(amount * 1.15)}</bdi></td></tr>; })}</tbody></table>
        <dl className={s.taxTotals}>
          <div><dt>الإجمالي غير شامل الضريبة</dt><dd><bdi>{sar(net)}</bdi></dd></div>
          <div><dt>مجموع ضريبة القيمة المضافة 15%</dt><dd><bdi>{sar(vat)}</bdi></dd></div>
          {Math.abs(adjust) >= 0.01 && <div><dt>خصومات ونقاط ورسوم إضافية</dt><dd><bdi>{sar(adjust)}</bdi></dd></div>}
          <div className={s.paperTotal}><dt>الإجمالي المستحق</dt><dd><bdi>{sar(total)}</bdi></dd></div>
          <div><dt>طريقة الدفع</dt><dd>{String(row.method ?? "مدى")}</dd></div>
        </dl>
        <p className={s.paperNote}>مستند عرض تجريبي وكل البيانات الضريبية فيه غير حقيقية</p>
      </article>
      <aside>
        <section className={s.panel}><div className={s.panelHead}><h2><ShieldCheck size={17} aria-hidden="true" /> المرحلة الأولى الإصدار والحفظ</h2><Badge>مطابق</Badge></div><div className={s.panelBody}><ul className={s.checks}>{phaseOne.map(item => <li key={item}><CheckCircle2 size={16} aria-hidden="true" />{item}</li>)}</ul></div></section>
        <section className={s.panel}><div className={s.panelHead}><h2><ShieldCheck size={17} aria-hidden="true" /> المرحلة الثانية الربط والتكامل</h2><Badge>{standard ? "معتمد" : "مرحّل"}</Badge></div><div className={s.panelBody}>
          <p className={s.note} style={{ marginTop: 0 }}>{standard ? "فاتورة ضريبية للمنشآت تعتمد من الهيئة قبل تسليمها للعميل" : "فاتورة مبسطة للأفراد تسلم للعميل فورًا ثم يبلغ بها خلال 24 ساعة"}</p>
          <dl className={s.zatca}>
            <div><dt>حالة الإرسال</dt><dd>{standard ? "تم الاعتماد" : "تم الإبلاغ"} <bdi>{date} {time}</bdi></dd></div>
            <div><dt>المعرف الفريد للفاتورة</dt><dd><bdi>{uuid(no)}</bdi></dd></div>
            <div><dt>عداد الفواتير</dt><dd><bdi>{seed}</bdi></dd></div>
            <div><dt>تجزئة الفاتورة</dt><dd><bdi>{hash}</bdi></dd></div>
            <div><dt>تجزئة الفاتورة السابقة</dt><dd><bdi>{previous}</bdi></dd></div>
            <div><dt>الختم الرقمي</dt><dd>موقعة بشهادة تجريبية</dd></div>
            <div><dt>صيغة الملف</dt><dd>XML ومعه PDF</dd></div>
            <div><dt>جهاز الإصدار</dt><dd>{branch} · وحدة تجريبية</dd></div>
          </dl>
        </div></section>
        <section className={s.panel}><div className={s.panelHead}><h2>سجل الفاتورة</h2></div><div className={s.panelBody}><Trace steps={[{ title: "أُصدرت الفاتورة", meta: `${date} ${time} · ${String(row.cashier ?? "الكاشير")}` }, { title: "وُلد رمز QR وختمت الفاتورة", meta: `${date} ${time} · النظام` }, { title: standard ? "اعتُمدت من منصة الفوترة" : "أُبلغ بها لمنصة الفوترة", meta: `${date} ${time} · ربط تجريبي` }, ...actions]} /></div></section>
      </aside>
    </div>
  </>;
}
