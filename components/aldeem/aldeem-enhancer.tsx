"use client";
import { useEffect, useRef, useState } from "react";

// Two account-wide behaviours for the Aldeem dashboard, applied to the screens that were built before the Aldeem kit:
// 1. Help: pointing at or focusing any button or link shows a small question mark with what the control does.
// 2. Quiet loading: a "loading ..." text placeholder is shown as a thin moving line instead of a text panel.
// Presentation only: no control is added, removed or re-wired, and no data request changes.

const rules: [RegExp, string][] = [
  [/^(حفظ|احفظ)/, "يحفظ البيانات المدخلة في هذه الصفحة"],
  [/^(إضافة|أضف|اضافة|جديد|إنشاء|انشاء)/, "يفتح نموذج إضافة سجل جديد في هذا القسم"],
  [/^(تعديل|عدل|تحرير)/, "يفتح السجل للتعديل ثم يحفظ التغييرات عند التأكيد"],
  [/^(حذف|احذف|إزالة)/, "يحذف السجل المحدد بعد التأكيد ولا يمكن التراجع عنه"],
  [/^(إلغاء|الغاء|تراجع)/, "يلغي العملية الحالية دون حفظ"],
  [/^(إغلاق|اغلاق|أغلق)/, "يغلق النافذة الحالية"],
  [/^(طباعة|اطبع|معاينة وطباعة)/, "يجهز المستند للطباعة أو الحفظ كملف"],
  [/^(معاينة)/, "يعرض المستند كما سيظهر قبل اعتماده"],
  [/^(تصدير)/, "ينزل البيانات المعروضة في ملف"],
  [/^(استيراد)/, "يضيف سجلات من ملف جاهز بعد مراجعته"],
  [/^(بحث|ابحث)/, "يبحث في سجلات هذا القسم بالكلمات المكتوبة"],
  [/^(تصفية|فلترة|تطبيق)/, "يطبق المرشحات المختارة على القائمة"],
  [/^(تحديث|إعادة تحميل|إعادة المحاولة)/, "يعيد قراءة البيانات من النظام"],
  [/^(ترحيل|رحل|إصدار|اصدار)/, "يعتمد المستند ويسجل أثره في الحسابات والمخزون ولا يعدل بعدها"],
  [/^(اعتماد|موافقة|وافق)/, "يعتمد الطلب أو المستند وينقله للمرحلة التالية"],
  [/^(رفض)/, "يرفض الطلب أو المستند مع بقاء أثره في السجل"],
  [/^(إرسال|ارسال|أرسل)/, "يرسل المستند أو الطلب إلى الجهة المحددة"],
  [/^(نسخ)/, "ينشئ نسخة من السجل لتعديلها كسجل جديد"],
  [/^(عرض|تفاصيل|فتح)/, "يفتح تفاصيل السجل"],
  [/^(تحميل|تنزيل)/, "ينزل الملف على جهازك"],
  [/^(رفع|إرفاق|ارفاق)/, "يرفق ملفًا بهذا السجل"],
  [/^(دفع|سداد|تحصيل|تسجيل دفعة)/, "يسجل مبلغًا مدفوعًا أو محصلًا ويؤثر في رصيد الخزينة"],
  [/^(استلام)/, "يسجل استلام البضاعة أو المبلغ ويحدث الأرصدة"],
  [/^(إرجاع|ارجاع|مرتجع)/, "يسجل مرتجعًا يعكس أثر المستند الأصلي"],
  [/^(تحويل)/, "ينقل الكمية أو المبلغ بين مستودعين أو حسابين"],
  [/^(جرد)/, "يبدأ أو يكمل جرد كميات المستودع ومطابقتها"],
  [/^(بدء|ابدأ|فتح وردية|بدء وردية)/, "يبدأ العملية أو الوردية"],
  [/^(إنهاء|انهاء|إقفال|اقفال)/, "ينهي العملية ويقفلها"],
  [/^(تفعيل|فعل)/, "يفعل هذا الخيار"],
  [/^(إيقاف|ايقاف|تعطيل)/, "يوقف هذا الخيار مع بقاء بياناته"],
  [/^(السابق|التالي|رجوع|عودة)/, "ينتقل بين الصفحات أو يعود للخلف"],
  [/^(الإعدادات|اعدادات|إعدادات)/, "يفتح إعدادات هذا القسم"],
  [/^(تسجيل الخروج|خروج)/, "يخرج من الحساب على هذا الجهاز"],
];

function explain(node: Element) {
  const own = node.getAttribute("data-help");
  if (own) return own;
  if (node.getAttribute("role") === "tab") return "يعرض هذا القسم من الصفحة";
  const raw = (node.getAttribute("aria-label") || node.getAttribute("title") || (node as HTMLElement).innerText || (node as HTMLInputElement).value || "").replace(/\s+/g, " ").trim();
  if (!raw || raw.length > 60) return "";
  const rule = rules.find(([pattern]) => pattern.test(raw));
  if (rule) return rule[1];
  return node.tagName === "A" ? `ينتقل إلى ${raw}` : node.tagName === "SELECT" ? "قائمة اختيار اختر منها القيمة المناسبة" : `ينفذ إجراء ${raw}`;
}

const loadingText = /^(جار|جارٍ|جاري)\s+(تحميل|التحميل|تجهيز|جلب|قراءة)/;
const targets = "button, a[href], [role='button'], summary, select";

export function AldeemEnhancer() {
  const [hint, setHint] = useState<{ text: string; top: number; left: number; open: boolean } | null>(null);
  const current = useRef<Element | null>(null);

  useEffect(() => {
    let hideTimer = 0;
    const show = (event: Event) => {
      // Moving onto the question mark itself keeps it open
      if (event.target instanceof Element && event.target.closest(".aldeem-hint")) { window.clearTimeout(hideTimer); return; }
      const node = event.target instanceof Element ? event.target.closest(targets) : null;
      // Controls built with the Aldeem kit carry their own help mark
      if (!node || node.closest("[data-no-help], nav[aria-label='قائمة العلامة'], aside") || (node as HTMLButtonElement).disabled) return;
      if (current.current === node) { window.clearTimeout(hideTimer); return; }
      const text = explain(node);
      if (!text) return;
      window.clearTimeout(hideTimer);
      current.current = node;
      const box = node.getBoundingClientRect();
      setHint({ text, top: Math.max(4, box.top - 9), left: Math.max(4, Math.min(window.innerWidth - 24, box.left - 9)), open: event.type === "focusin" });
    };
    const hide = () => { window.clearTimeout(hideTimer); hideTimer = window.setTimeout(() => { current.current = null; setHint(null); }, 220); };
    const dismiss = () => { current.current = null; setHint(null); };
    document.addEventListener("mouseover", show);
    document.addEventListener("focusin", show);
    document.addEventListener("mouseout", hide);
    document.addEventListener("focusout", hide);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.clearTimeout(hideTimer);
      document.removeEventListener("mouseover", show); document.removeEventListener("focusin", show);
      document.removeEventListener("mouseout", hide); document.removeEventListener("focusout", hide);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    const marked = new Set<Element>();
    const scan = () => {
      frame = 0;
      for (const node of marked) if (!node.isConnected || !loadingText.test((node.textContent ?? "").trim())) { node.removeAttribute("data-aldeem-loading"); marked.delete(node); }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        const parent = text.parentElement;
        if (!parent || marked.has(parent) || !loadingText.test((text.nodeValue ?? "").trim())) continue;
        // The label of a button reports its own action and stays readable
        if (parent.closest("button, a, option, [class*='aldeem-ui-module']")) continue;
        parent.setAttribute("data-aldeem-loading", ""); marked.add(parent);
      }
    };
    // At most one pass every 150ms however often the page changes
    const observer = new MutationObserver(() => { if (!frame) frame = window.setTimeout(scan, 150); });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    scan();
    return () => { observer.disconnect(); if (frame) window.clearTimeout(frame); for (const node of marked) node.removeAttribute("data-aldeem-loading"); };
  }, []);

  return <>
    <style>{`
[data-aldeem-loading]{position:relative!important;display:block!important;min-height:3px!important;height:3px!important;max-height:3px!important;padding:0!important;margin:10px 0!important;border:0!important;border-radius:999px!important;background:#f3c3d9!important;color:transparent!important;font-size:0!important;line-height:0!important;overflow:hidden!important;box-shadow:none!important}
[data-aldeem-loading] *{display:none!important}
[data-aldeem-loading]::after{content:"";position:absolute;inset-block:0;inset-inline-start:0;width:35%;border-radius:999px;background:#6b347e;animation:aldeem-loading 1.1s ease-in-out infinite}
@keyframes aldeem-loading{0%{transform:translateX(100%)}100%{transform:translateX(-320%)}}
@media(prefers-reduced-motion:reduce){[data-aldeem-loading]::after{animation:none;width:100%;opacity:.5}}
.aldeem-hint{position:fixed;z-index:2147483000;display:grid;place-items:center;width:17px;height:17px;border:1px solid #6b347e;border-radius:50%;background:#fff;color:#6b347e;font:700 10px/1 Tahoma,sans-serif;cursor:help}
.aldeem-hint>span{position:absolute;inset-block-start:21px;inset-inline-start:0;width:max-content;max-width:230px;padding:8px 11px;border-radius:10px;background:#442b4e;color:#fff;font:400 11px/1.7 Tahoma,sans-serif;text-align:start;box-shadow:0 10px 24px #442b4e33;opacity:0;visibility:hidden;pointer-events:none}
.aldeem-hint:hover>span,.aldeem-hint[data-open]>span{opacity:1;visibility:visible}
`}</style>
    {hint && <span className="aldeem-hint" role="tooltip" data-open={hint.open || undefined} style={{ top: hint.top, left: hint.left }}>؟<span>{hint.text}</span></span>}
  </>;
}
