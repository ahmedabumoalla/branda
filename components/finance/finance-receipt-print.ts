export type ReceiptPaper = "auto" | "58" | "80";
export type ReceiptCopy = "customer" | "preparation";
export type ReceiptBrand = { name: string; logoUrl: string | null; color: string };
export type ReceiptPrintOptions = { allCopies?: boolean; newCopy?: boolean };
export type ReceiptPrintResult = { usedAssetFallback: boolean; submittedToDevice?: boolean };
export type ReceiptPrintHandler = (element: HTMLElement | null, paper: ReceiptPaper, options: ReceiptPrintOptions) => Promise<ReceiptPrintResult>;

/** The browser cannot enumerate printer capabilities; auto follows the selected driver's paper. */
export function thermalReceiptCss(paper: ReceiptPaper = "auto", origin = "") {
  const fontRoot = new URL("/fonts/", origin || "http://localhost").href;
  return `@font-face{font-family:ReceiptArabic;src:url("${fontRoot}tajawal-regular.ttf") format("truetype");font-weight:400;font-display:block}
@font-face{font-family:ReceiptArabic;src:url("${fontRoot}tajawal-bold.ttf") format("truetype");font-weight:700;font-display:block}
@page{size:auto;margin:2mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:white;color:black}
body{font:12px/1.5 ReceiptArabic,Arial,sans-serif}article[data-finance-receipt]{width:100%;max-width:${paper === "58" ? "54" : "76"}mm;margin:0 auto;overflow-wrap:anywhere}
[data-receipt-header]{text-align:center;padding:2mm 0 3mm;border-bottom:1px dashed #000}
[data-receipt-header] img{display:block;width:auto;height:auto;max-width:38mm;max-height:22mm;margin:0 auto 2mm;object-fit:contain}
h3{font-size:17px;line-height:1.3;margin:1mm 0}p{margin:1mm 0}[data-receipt-title]{font-weight:700;font-size:14px}
[data-receipt-meta]{padding:2mm 0;border-bottom:1px dashed #000}
[data-receipt-row]{display:flex;justify-content:space-between;gap:2mm;padding:1mm 0;break-inside:avoid}
[data-receipt-row]>:last-child{flex-shrink:0}[data-receipt-items]{width:100%;border-collapse:collapse;table-layout:fixed;margin:2mm 0}
th{text-align:right;font-size:11px;border-bottom:1px solid black}td,th{padding:1.5mm .5mm;vertical-align:top;overflow-wrap:anywhere}
td{border-bottom:1px dashed #bbb}tr{break-inside:avoid}th:first-child{width:53%}th:nth-child(2){width:15%;text-align:center}td:nth-child(2){text-align:center}th:last-child,td:last-child{text-align:left}
td small{display:block;font-size:10px}[data-receipt-total]{border-top:1px solid black;border-bottom:2px solid black;font-size:16px;font-weight:700;padding:2mm 0;margin:1mm 0}
[data-receipt-footer]{text-align:center;border-top:1px dashed #000;margin-top:3mm;padding-top:2mm;font-size:10px}
[data-receipt-note]{white-space:pre-wrap;margin:2mm 0}[data-receipt-preparation] th:first-child{width:78%}[data-receipt-preparation] td{font-size:16px;font-weight:700;padding:3mm 1mm}
[data-receipt-preparation] td:last-child{font-size:20px;text-align:center}[data-receipt-preparation] th:last-child{text-align:center}
article[data-finance-receipt]+article[data-finance-receipt]{break-before:page;page-break-before:always}
@media print{article[data-finance-receipt]{color:#000!important}thead{display:table-header-group}img{print-color-adjust:exact;-webkit-print-color-adjust:exact}}`;
}

function waitForImage(image: HTMLImageElement) {
  return new Promise<boolean>((resolve) => {
    if (image.complete) { resolve(Boolean(image.naturalWidth)); return; }
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
  });
}

/** Uses only React-rendered receipt articles, suitable for browser printing or an authorized local print bridge. */
export function buildThermalReceiptHtml(element: HTMLElement | null, paper: ReceiptPaper = "auto", options: ReceiptPrintOptions & { origin?: string } = {}) {
  if (!element) throw new Error("الفاتورة غير جاهزة للطباعة");
  const receipts = element.matches("[data-finance-receipt]") ? [element] : options.allCopies ? Array.from(element.querySelectorAll<HTMLElement>("[data-finance-receipt]")) : [element.querySelector<HTMLElement>("[data-finance-receipt]")].filter((value): value is HTMLElement => Boolean(value));
  if (!receipts.length) throw new Error("الفاتورة غير جاهزة للطباعة");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>الفاتورة</title><style>${thermalReceiptCss(paper, options.origin ?? (typeof window === "undefined" ? "" : window.location.origin))}</style></head><body>${receipts.map(receipt => receipt.outerHTML).join("")}</body></html>`;
}

/** Opening the browser print dialog is not evidence that paper left the printer. */
export async function printThermalReceipt(element: HTMLElement | null, paper: ReceiptPaper = "auto", options: ReceiptPrintOptions = {}): Promise<ReceiptPrintResult> {
  const html = buildThermalReceiptHtml(element, paper, options);
  const frame = document.createElement("iframe");
  frame.title = "طباعة الفاتورة الحرارية";
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;width:320px;height:1px;left:-10000px;bottom:0;border:0;pointer-events:none";
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let assetTimeout: ReturnType<typeof setTimeout> | undefined;
  let fallback = false;
  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        frame.onload = () => {
          const target = frame.contentWindow;
          const doc = frame.contentDocument;
          if (!target || !doc) { reject(new Error("تعذر فتح نافذة الطباعة")); return; }
          // Cached assets are preferred; an offline logo/font must never block the sale's print job.
          const fonts = doc.fonts ? Promise.all([doc.fonts.load("12px ReceiptArabic"), doc.fonts.load("700 12px ReceiptArabic"), doc.fonts.ready]).then(() => true, () => false) : Promise.resolve(false);
          const assets = Promise.all([fonts, ...Array.from(doc.images).map(waitForImage)]);
          Promise.race([assets, new Promise<null>(done => { assetTimeout = setTimeout(() => done(null), 2500); })]).then(results => {
            if (assetTimeout) clearTimeout(assetTimeout);
            fallback = !results || results.some(result => !result);
            if (!results || !results[0]) doc.body.style.fontFamily = "Arial, sans-serif";
            for (const image of Array.from(doc.images)) if (!image.complete || !image.naturalWidth) image.remove();
            resolve();
          }, reject);
        };
        frame.srcdoc = html;
        document.body.appendChild(frame);
      }),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("تعذر تجهيز نافذة الطباعة أعد المحاولة")), 20_000); }),
    ]);
    if (timeout) clearTimeout(timeout);
    const target = frame.contentWindow!;
    target.onafterprint = () => frame.remove();
    target.focus();
    target.print();
    // Some embedded browsers do not emit afterprint; retain the document for their print job.
    setTimeout(() => frame.remove(), 300_000);
    return { usedAssetFallback: fallback };
  } catch (error) { frame.remove(); throw error; }
  finally { if (timeout) clearTimeout(timeout); if (assetTimeout) clearTimeout(assetTimeout); }
}

const attemptedPrints = new Set<string>();
/** Attempt only once, including Strict Mode, reconnects and dialog remounts. Manual reprints remain explicit. */
export function claimAutomaticReceiptPrint(brandSlug: string, saleId: string) {
  const key = `branda:receipt-print-attempt:${encodeURIComponent(brandSlug)}:${encodeURIComponent(saleId)}`;
  if (attemptedPrints.has(key)) return false;
  try { if (window.sessionStorage?.getItem(key)) { attemptedPrints.add(key); return false; } } catch { /* Restricted storage uses this tab's in-memory guard. */ }
  attemptedPrints.add(key);
  try { window.sessionStorage?.setItem(key, "1"); } catch { /* Printing remains available when storage is restricted. */ }
  return true;
}
