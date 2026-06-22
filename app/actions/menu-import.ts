"use server";

import {
  approveMenuImport,
  cancelMenuImport,
  createMenuImportFromPdf,
  createMenuImportFromUrl,
  getMenuImportJob,
  updateMenuImportItems,
} from "@/lib/data/menu-imports";
import { getOwnerCafeContext } from "@/lib/data/cafes";
import { escapeEmailHtml, isBarndaksaEmailConfigured, sendBarndaksaEmail } from "@/lib/email/resend";
import type { MenuImportEditableItem } from "@/lib/menu-import/types";

const MENU_IMPORT_REPORT_EMAIL = "cto.branda@gmail.com";

export async function createMenuImportFromUrlAction(sourceUrl: string) {
  return createMenuImportFromUrl(sourceUrl);
}

export async function createMenuImportFromPdfAction(formData: FormData) {
  return createMenuImportFromPdf(formData);
}

export async function reportMenuImportUrlAction(input: { menuUrl: string; source?: string }) {
  const menuUrl = String(input.menuUrl ?? "").trim();
  const source = String(input.source ?? "dashboard-menu-import").trim() || "dashboard-menu-import";

  if (!menuUrl) {
    return { ok: false, message: "أدخل رابط المنيو أولًا." };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(menuUrl);
  } catch {
    return { ok: false, message: "رابط المنيو غير صحيح." };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return { ok: false, message: "رابط المنيو يجب أن يبدأ بـ http أو https." };
  }

  const cafe = await getOwnerCafeContext().catch(() => null);
  if (!isBarndaksaEmailConfigured()) {
    console.warn("[reportMenuImportUrlAction] Resend is not configured; menu URL report was not emailed.");
    return { ok: false, message: "تعذر الإرسال، حاول مرة أخرى." };
  }

  const submittedAt = new Date().toISOString();
  const cafeName = cafe?.name ?? "غير متاح";
  const cafeId = cafe?.id ?? "غير متاح";

  try {
    await sendBarndaksaEmail({
      to: MENU_IMPORT_REPORT_EMAIL,
      subject: "رابط منيو يحتاج مراجعة في Barndaksa",
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#241610">
          <h2>رابط منيو يحتاج مراجعة تقنية</h2>
          <p>هناك رابط منيو لم يتم تعريفه أو لم يتم استخراج أصنافه بالكامل داخل نظام استيراد المنيو.</p>
          <div style="margin:16px 0;padding:14px;border:1px solid #eadfd5;border-radius:14px;background:#fcf8f3">
            <p><strong>رابط المنيو:</strong> <a href="${escapeEmailHtml(parsedUrl.toString())}">${escapeEmailHtml(parsedUrl.toString())}</a></p>
            <p><strong>اسم العلامة التجارية:</strong> ${escapeEmailHtml(cafeName)}</p>
            <p><strong>معرف المقهى:</strong> ${escapeEmailHtml(cafeId)}</p>
            <p><strong>وقت الإرسال:</strong> ${escapeEmailHtml(submittedAt)}</p>
            <p><strong>المصدر:</strong> ${escapeEmailHtml(source)}</p>
          </div>
        </div>
      `,
      text: [
        "رابط منيو يحتاج مراجعة تقنية",
        "هناك رابط منيو لم يتم تعريفه أو لم يتم استخراج أصنافه بالكامل داخل نظام استيراد المنيو.",
        `رابط المنيو: ${parsedUrl.toString()}`,
        `اسم العلامة التجارية: ${cafeName}`,
        `معرف المقهى: ${cafeId}`,
        `وقت الإرسال: ${submittedAt}`,
        `المصدر: ${source}`,
      ].join("\n"),
    });
    return { ok: true, message: "تم إرسال الرابط للفريق التقني." };
  } catch (error) {
    console.error("[reportMenuImportUrlAction]", error);
    return { ok: false, message: "تعذر الإرسال، حاول مرة أخرى." };
  }
}

export async function getMenuImportJobAction(jobId: string) {
  return getMenuImportJob(jobId);
}

export async function updateMenuImportItemsAction(jobId: string, items: MenuImportEditableItem[]) {
  return updateMenuImportItems(jobId, items);
}

export async function approveMenuImportAction(jobId: string, items: MenuImportEditableItem[]) {
  return approveMenuImport(jobId, items);
}

export async function cancelMenuImportAction(jobId: string) {
  return cancelMenuImport(jobId);
}
