"use client";

import { Check, FileText, LinkIcon, Loader2, Send, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  approveMenuImportAction,
  cancelMenuImportAction,
  createMenuImportFromPdfAction,
  createMenuImportFromUrlAction,
  reportMenuImportUrlAction,
  updateMenuImportItemsAction,
} from "@/app/actions/menu-import";
import { NeumoInput, PrimaryButton } from "@/components/ui/design-system";
import type { MenuImportEditableItem, MenuImportReviewJob } from "@/lib/menu-import/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
};

function editableFromJob(job: MenuImportReviewJob): MenuImportEditableItem[] {
  return job.items
    .filter((item) => item.status !== "imported")
    .map((item) => ({
      id: item.id,
      categoryName: item.categoryName || "غير مصنف",
      productName: item.productName,
      description: item.description,
      price: item.price,
      calories: item.calories,
      prepTimeMinutes: item.prepTimeMinutes,
      chefName: item.chefName,
      imageUrl: item.imageUrl,
      imageStoragePath: item.imageStoragePath,
      status: item.status === "skipped" ? "skipped" : item.status === "ready" ? "ready" : "needs_review",
    }));
}

function numberOrNull(value: string) {
  if (value.trim() === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "";
  }
}

function menuImportErrorMessage(error: unknown, fallback: string) {
  const text = errorText(error);
  if (
    text.includes("42501") ||
    (text.toLowerCase().includes("permission denied") && text.includes("menu_import"))
  ) {
    return "تعذر إنشاء مسودة الاستيراد بسبب صلاحيات قاعدة البيانات. شغّل migration 053 ثم أعد المحاولة.";
  }
  return fallback;
}

function rawStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function rawRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function MenuImportModal({ open, onClose, onImported }: Props) {
  const [mode, setMode] = useState<"pdf" | "url">("pdf");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<MenuImportReviewJob | null>(null);
  const [items, setItems] = useState<MenuImportEditableItem[]>([]);
  const [message, setMessage] = useState("");
  const [reportUrl, setReportUrl] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const stats = useMemo(() => {
    const active = items.filter((item) => item.status !== "skipped");
    return {
      total: active.length,
      needsReview: active.filter((item) => item.status === "needs_review").length,
      withoutPrice: active.filter((item) => item.price == null).length,
      withoutImage: active.filter((item) => !item.imageUrl && !item.imageStoragePath).length,
    };
  }, [items]);

  const importSummary = useMemo(() => {
    const raw = rawRecord(job?.rawSummary);
    const report = rawRecord(raw.report);
    return {
      sourceType: typeof raw.sourceType === "string" ? raw.sourceType : typeof raw.adapter === "string" ? "known-platform" : "",
      confidence: typeof raw.confidence === "number" ? Math.round(raw.confidence * 100) : null,
      warnings: rawStringArray(raw.warnings).concat(rawStringArray(report.notes)),
      extractionSteps: rawStringArray(raw.extractionSteps),
    };
  }, [job]);

  if (!open || !mounted) return null;

  function setRow(index: number, patch: Partial<MenuImportEditableItem>) {
    setItems((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  async function analyze() {
    setBusy(true);
    setMessage(mode === "url" ? "جاري قراءة الرابط..." : "جاري قراءة الملف...");
    const progressMessages = ["جاري البحث عن التصنيفات...", "جاري استخراج المنتجات...", "جاري ترتيب النتائج..."];
    const progressTimers =
      mode === "url"
        ? progressMessages.map((nextMessage, index) =>
            window.setTimeout(() => {
              setMessage(nextMessage);
            }, 900 + index * 1200)
          )
        : [];
    try {
      const nextJob =
        mode === "url"
          ? await createMenuImportFromUrlAction(url)
          : await createMenuImportFromPdfAction(
              (() => {
                const formData = new FormData();
                if (file) formData.set("file", file);
                return formData;
              })()
            );
      setJob(nextJob);
      const nextItems = editableFromJob(nextJob);
      setItems(nextItems);
      setMessage(nextJob.errorMessage ?? `تم استخراج ${nextItems.length} صنف`);
    } catch (error) {
      console.error("Menu import draft creation failed", error);
      setMessage(menuImportErrorMessage(error, "تعذر إنشاء مسودة الاستيراد."));
    } finally {
      progressTimers.forEach((timer) => window.clearTimeout(timer));
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!job) return;
    setBusy(true);
    setMessage("");
    try {
      const nextJob = await updateMenuImportItemsAction(job.id, items);
      setJob(nextJob);
      setItems(editableFromJob(nextJob));
      setMessage("تم حفظ تعديلات المسودة.");
    } catch (error) {
      console.error("Menu import draft save failed", error);
      setMessage(menuImportErrorMessage(error, "تعذر حفظ تعديلات المسودة."));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!job) return;
    setBusy(true);
    setMessage("");
    try {
      const nextJob = await approveMenuImportAction(job.id, items);
      setJob(nextJob);
      setItems(editableFromJob(nextJob));
      setMessage("تم اعتماد المنتجات الجاهزة وإضافتها للمنيو.");
      onImported();
    } catch (error) {
      console.error("Menu import approval failed", error);
      setMessage(menuImportErrorMessage(error, "تعذر اعتماد المسودة. راجع الصفوف التي تحتاج مراجعة."));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!job) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await cancelMenuImportAction(job.id);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function reportIncompleteMenuUrl() {
    const targetUrl = reportUrl.trim() || (mode === "url" ? url.trim() : "");
    if (!targetUrl) {
      setReportMessage("أدخل رابط المنيو المراد إرساله.");
      return;
    }

    setReportBusy(true);
    setReportMessage("");
    try {
      const result = await reportMenuImportUrlAction({
        menuUrl: targetUrl,
        source: "dashboard-menu-import",
      });
      setReportMessage(result.message);
      if (result.ok) setReportUrl("");
    } catch (error) {
      console.error("Menu import URL report failed", error);
      setReportMessage("تعذر الإرسال، حاول مرة أخرى.");
    } finally {
      setReportBusy(false);
    }
  }

  const canAnalyze = mode === "url" ? url.trim().length > 0 : Boolean(file);
  const canApprove = Boolean(job) && items.some((item) => item.status === "ready" && item.productName.trim());
  const canReport = reportUrl.trim().length > 0 || (mode === "url" && url.trim().length > 0);

  const modal = (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-black/40 p-4">
      <div className="mx-auto my-6 max-w-6xl rounded-[28px] bg-[#FCF8F3] p-5 text-right shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-[#3A2117]">استيراد المنيو</h2>
            <p className="mt-1 text-sm font-bold text-[#806A5E]">أنشئ مسودة من PDF أو رابط خارجي، ثم راجع الصفوف قبل الإضافة النهائية.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-white p-3 text-[#3A2117]"
            disabled={busy}
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-[220px_1fr_auto]">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-2">
            <button
              type="button"
              onClick={() => setMode("pdf")}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${mode === "pdf" ? "bg-[#3A2117] text-white" : "text-[#3A2117]"}`}
            >
              <FileText className="h-4 w-4" />
              PDF
            </button>
            <button
              type="button"
              onClick={() => setMode("url")}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${mode === "url" ? "bg-[#3A2117] text-white" : "text-[#3A2117]"}`}
            >
              <LinkIcon className="h-4 w-4" />
              رابط
            </button>
          </div>

          {mode === "pdf" ? (
            <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-[#E7D7C6] bg-white px-4 font-bold text-[#3A2117]">
              <Upload className="h-5 w-5 text-[#6B3A25]" />
              <span className="truncate">{file ? file.name : "اختر ملف PDF حتى 20MB"}</span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
          ) : (
            <NeumoInput
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/menu"
              dir="ltr"
              className="text-left"
            />
          )}

          <PrimaryButton onClick={analyze} disabled={busy || !canAnalyze} className="inline-flex items-center justify-center gap-2">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            تحليل وإنشاء مسودة
          </PrimaryButton>
        </div>

        {message ? (
          <div className="mb-5 rounded-2xl border border-[#E7D7C6] bg-white px-4 py-3 text-sm font-bold text-[#6B3A25]">
            {message}
          </div>
        ) : null}

        {busy && mode === "url" ? (
          <div className="mb-5 grid gap-2 rounded-2xl border border-[#E7D7C6] bg-white p-4 text-sm font-bold text-[#806A5E] sm:grid-cols-4">
            {["جاري قراءة الرابط", "جاري البحث عن التصنيفات", "جاري استخراج المنتجات", "جاري ترتيب النتائج"].map((step) => (
              <div key={step} className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-[#6B3A25]" />
                <span>{step}</span>
              </div>
            ))}
          </div>
        ) : null}

        {job && (importSummary.sourceType || importSummary.confidence !== null || importSummary.warnings.length || importSummary.extractionSteps.length) ? (
          <div className="mb-5 rounded-2xl border border-[#E7D7C6] bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {importSummary.sourceType ? <Stat label="نوع الاستخراج" value={importSummary.sourceType} /> : null}
              {importSummary.confidence !== null ? <Stat label="الثقة" value={`${importSummary.confidence}%`} /> : null}
              <Stat label="التحذيرات" value={importSummary.warnings.length} />
              <Stat label="خطوات الاستخراج" value={importSummary.extractionSteps.length} />
            </div>
            {importSummary.warnings.length ? (
              <div className="mt-4 rounded-xl bg-[#FCF8F3] p-3 text-sm font-bold text-[#6B3A25]">
                {Array.from(new Set(importSummary.warnings)).map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}
            {importSummary.extractionSteps.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {importSummary.extractionSteps.map((step) => (
                  <span key={step} className="rounded-full bg-[#F8F4EF] px-3 py-1 text-xs font-black text-[#806A5E]">
                    {step}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mb-5 rounded-2xl border border-[#E7D7C6] bg-white p-4">
          <div className="mb-3">
            <h3 className="text-base font-black text-[#3A2117]">لم يتم استخراج كامل الأصناف؟</h3>
            <p className="mt-1 text-sm font-bold text-[#806A5E]">
              برجاء إرسال رابط المنيو للفريق التقني لمراجعته وإضافته للنظام.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <NeumoInput
              value={reportUrl}
              onChange={(event) => setReportUrl(event.target.value)}
              placeholder={mode === "url" && url.trim() ? url.trim() : "https://example.com/menu"}
              dir="ltr"
              className="text-left"
            />
            <button
              type="button"
              onClick={reportIncompleteMenuUrl}
              disabled={reportBusy || !canReport}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#3A2117] px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {reportBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              إرسال للفريق التقني
            </button>
          </div>
          {reportMessage ? (
            <p className={`mt-3 text-sm font-black ${reportMessage.includes("تم إرسال") ? "text-emerald-700" : "text-[#6B3A25]"}`}>
              {reportMessage}
            </p>
          ) : null}
        </div>

        {job ? (
          <>
            <div className="mb-5 grid gap-3 sm:grid-cols-4">
              <Stat label="المنتجات المستخرجة" value={stats.total} />
              <Stat label="تحتاج مراجعة" value={stats.needsReview} />
              <Stat label="بدون سعر" value={stats.withoutPrice} />
              <Stat label="بدون صورة" value={stats.withoutImage} />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[#E7D7C6] bg-white">
              <table className="min-w-[1120px] w-full border-collapse text-sm">
                <thead className="bg-[#F8F4EF] text-[#3A2117]">
                  <tr>
                    <Th>الحالة</Th>
                    <Th>الصورة</Th>
                    <Th>اسم المنتج</Th>
                    <Th>السعر</Th>
                    <Th>التصنيف</Th>
                    <Th>الوصف</Th>
                    <Th>السعرات</Th>
                    <Th>التحضير</Th>
                    <Th>الشيف</Th>
                    <Th>حذف</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center font-bold text-[#806A5E]">لا توجد صفوف مستخرجة. جرّب مصدرًا آخر أو أعد المحاولة لاحقًا.</td>
                    </tr>
                  ) : (
                    items.map((item, index) => (
                      <tr key={item.id} className={item.status === "skipped" ? "opacity-50" : ""}>
                        <Td>
                          <select
                            value={item.status}
                            onChange={(event) => setRow(index, { status: event.target.value as MenuImportEditableItem["status"] })}
                            className="h-10 rounded-xl border border-[#E7D7C6] bg-[#FCF8F3] px-2 font-bold"
                          >
                            <option value="ready">جاهز</option>
                            <option value="needs_review">يحتاج مراجعة</option>
                            <option value="skipped">مرفوض</option>
                          </select>
                        </Td>
                        <Td>
                          <div className="flex min-w-44 items-center gap-2">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                            ) : item.imageStoragePath ? (
                              <span className="shrink-0 text-xs font-bold text-[#806A5E]">مرفوعة</span>
                            ) : (
                              <span className="shrink-0 text-xs font-bold text-[#806A5E]">بدون</span>
                            )}
                            <CellInput value={item.imageUrl} onChange={(value) => setRow(index, { imageUrl: value })} />
                          </div>
                        </Td>
                        <Td>
                          <CellInput value={item.productName} onChange={(value) => setRow(index, { productName: value })} />
                        </Td>
                        <Td>
                          <CellInput
                            value={item.price == null ? "" : String(item.price)}
                            inputMode="decimal"
                            onChange={(value) => setRow(index, { price: numberOrNull(value) })}
                          />
                        </Td>
                        <Td>
                          <CellInput value={item.categoryName} onChange={(value) => setRow(index, { categoryName: value })} />
                        </Td>
                        <Td>
                          <CellInput value={item.description} onChange={(value) => setRow(index, { description: value })} />
                        </Td>
                        <Td>
                          <CellInput value={item.calories == null ? "" : String(item.calories)} inputMode="numeric" onChange={(value) => setRow(index, { calories: numberOrNull(value) })} />
                        </Td>
                        <Td>
                          <CellInput value={item.prepTimeMinutes == null ? "" : String(item.prepTimeMinutes)} inputMode="numeric" onChange={(value) => setRow(index, { prepTimeMinutes: numberOrNull(value) })} />
                        </Td>
                        <Td>
                          <CellInput value={item.chefName} onChange={(value) => setRow(index, { chefName: value })} />
                        </Td>
                        <Td>
                          <button
                            type="button"
                            onClick={() => setRow(index, { status: "skipped" })}
                            className="rounded-xl bg-[#F8F4EF] p-2 text-[#6B3A25]"
                            aria-label="حذف الصف"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={cancel}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-[#6B3A25]"
              >
                <X className="h-5 w-5" />
                إلغاء الاستيراد
              </button>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={saveDraft}
                  disabled={busy}
                  className="rounded-2xl bg-white px-5 py-3 font-black text-[#3A2117]"
                >
                  حفظ المسودة
                </button>
                <PrimaryButton onClick={approve} disabled={busy || !canApprove} className="inline-flex items-center gap-2">
                  <Check className="h-5 w-5" />
                  اعتماد وإضافة المنتجات
                </PrimaryButton>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3">
      <p className="text-xs font-black text-[#806A5E]">{label}</p>
      <p className="mt-1 text-2xl font-black text-[#3A2117]">{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-[#E7D7C6] p-3 text-right font-black">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-[#F0E5DA] p-2 align-middle">{children}</td>;
}

function CellInput({
  value,
  onChange,
  inputMode,
}: {
  value: string;
  onChange: (value: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <input
      value={value}
      inputMode={inputMode}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full min-w-28 rounded-xl border border-[#E7D7C6] bg-[#FCF8F3] px-3 font-bold text-[#3A2117] outline-none"
    />
  );
}
