"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, ExternalLink, Gift, Link as LinkIcon, MessageSquareText, XCircle } from "lucide-react";
import {
  approveExperienceRewardSubmissionAction,
  rejectExperienceRewardSubmissionAction,
} from "@/app/actions/experience-rewards";
import { formatSar } from "@/lib/format";
import type { OwnerExperienceRewardSubmission } from "@/lib/data/experience-rewards";
import type { MenuProduct } from "@/lib/mock/menu";

type Props = {
  initialSubmissions: OwnerExperienceRewardSubmission[];
  products: MenuProduct[];
  configError?: string;
};

type RewardDraft = Record<string, boolean>;

function statusLabel(status: string) {
  if (status === "approved") return "مكافأة جاهزة";
  if (status === "redeemed") return "تم الصرف";
  if (status === "rejected") return "مرفوض";
  return "بانتظار المراجعة";
}

export function ExperienceRewardReviewsPageClient({
  initialSubmissions,
  products,
  configError,
}: Props) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [selected, setSelected] = useState<OwnerExperienceRewardSubmission | null>(
    initialSubmissions[0] ?? null
  );
  const [selectedProducts, setSelectedProducts] = useState<RewardDraft>({});
  const [expiresAt, setExpiresAt] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString().slice(0, 10);
  });
  const [reviewNotes, setReviewNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const rewardProducts = useMemo(
    () =>
      products.filter((product) => selectedProducts[product.id]).map((product) => ({
        productId: product.id,
        productName: product.name,
        quantity: 1,
      })),
    [products, selectedProducts]
  );

  async function approveSelected() {
    if (!selected) return;
    if (!rewardProducts.length) {
      setMessage("اختر منتج واحد على الأقل كمكافأة");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const result = await approveExperienceRewardSubmissionAction({
        submissionId: selected.id,
        rewardExpiresAt: expiresAt,
        reviewNotes,
        items: rewardProducts,
      });

      setSubmissions((current) =>
        current.map((item) =>
          item.id === selected.id
            ? {
                ...item,
                status: "approved",
                rewardCode: result.rewardCode,
                rewardExpiresAt: expiresAt,
                reviewNotes,
                items: rewardProducts.map((product, index) => ({
                  id: `${selected.id}-${index}`,
                  productId: product.productId,
                  productName: product.productName,
                  quantity: product.quantity,
                })),
              }
            : item
        )
      );
      setSelected((current) =>
        current
          ? {
              ...current,
              status: "approved",
              rewardCode: result.rewardCode,
              rewardExpiresAt: expiresAt,
              reviewNotes,
              items: rewardProducts.map((product, index) => ({
                id: `${current.id}-${index}`,
                productId: product.productId,
                productName: product.productName,
                quantity: product.quantity,
              })),
            }
          : current
      );
      setMessage(`تم اعتماد التوثيق وإصدار الباركود ${result.rewardCode}`);
    } catch {
      setMessage("تعذر اعتماد التوثيق");
    } finally {
      setBusy(false);
    }
  }

  async function rejectSelected() {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      await rejectExperienceRewardSubmissionAction(
        selected.id,
        reviewNotes || "لم يتم اعتماد التوثيق"
      );
      setSubmissions((current) =>
        current.map((item) => (item.id === selected.id ? { ...item, status: "rejected", reviewNotes } : item))
      );
      setSelected((current) => (current ? { ...current, status: "rejected", reviewNotes } : current));
      setMessage("تم رفض التوثيق");
    } catch {
      setMessage("تعذر رفض التوثيق");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#F8F4EF] px-4 py-8 text-[#311912]">
      <section className="mx-auto max-w-7xl">
        <div className="mb-6 rounded-[32px] bg-white p-6 shadow-sm">
          <p className="text-sm font-black text-[#9B6A34]">مراجعة توثيق التجارب للعملاء</p>
          <h1 className="mt-1 text-3xl font-black">اعتماد المكافآت وربطها بالباركود</h1>
          <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">
            راجع رابط التوثيق وبيانات العميل ثم اختر منتجات من المنيو كمكافأة وحدد صلاحيتها
          </p>
        </div>

        {configError ? (
          <div className="mb-6 rounded-2xl bg-amber-50 p-4 font-black text-amber-800">
            {configError}
          </div>
        ) : null}

        {message ? (
          <div className="mb-6 rounded-2xl bg-[#FFF8EA] p-4 font-black text-[#6B3A25]">
            {message}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[32px] bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-xl font-black">طلبات التوثيق</h2>
            <div className="space-y-3">
              {submissions.length ? (
                submissions.map((submission) => (
                  <button
                    key={submission.id}
                    type="button"
                    onClick={() => {
                      setSelected(submission);
                      setSelectedProducts(
                        Object.fromEntries(submission.items.map((item) => [item.productId, true]))
                      );
                      setReviewNotes(submission.reviewNotes || "");
                      setExpiresAt(submission.rewardExpiresAt || expiresAt);
                    }}
                    className={`w-full rounded-3xl border p-4 text-right transition ${
                      selected?.id === submission.id
                        ? "border-[#6B3A25] bg-[#FCF8F3]"
                        : "border-[#E7D7C6] bg-white hover:bg-[#FCF8F3]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-black">{submission.customerName}</p>
                      <span className="rounded-full bg-[#F1D7C6] px-3 py-1 text-xs font-black text-[#6B3A25]">
                        {statusLabel(submission.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-bold text-[#806A5E]">
                      {submission.currentViews} مشاهدة · {submission.currentComments} تعليق
                    </p>
                    <p className="mt-1 line-clamp-1 text-xs font-bold text-[#806A5E]">
                      {submission.experienceUrl}
                    </p>
                  </button>
                ))
              ) : (
                <p className="rounded-3xl bg-[#FCF8F3] p-6 text-center font-bold text-[#806A5E]">
                  لا توجد طلبات توثيق حتى الآن
                </p>
              )}
            </div>
          </section>

          {selected ? (
            <section className="space-y-5">
              <article className="rounded-[32px] bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-[#9B6A34]">بيانات العميل</p>
                    <h2 className="mt-1 text-2xl font-black">{selected.customerName}</h2>
                    <p className="mt-2 text-sm font-bold text-[#806A5E]">
                      {selected.customerPhone || "-"} · {selected.customerEmail || "-"}
                    </p>
                    <p className="mt-1 text-sm font-bold text-[#806A5E]">
                      مسجل منذ {selected.customerCreatedAt ? selected.customerCreatedAt.slice(0, 10) : "-"}
                    </p>
                  </div>
                  <span className="rounded-2xl bg-[#6B3A25] px-4 py-2 font-black text-white">
                    {statusLabel(selected.status)}
                  </span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl bg-[#FCF8F3] p-4 text-center">
                    <p className="text-2xl font-black">{selected.orderCount}</p>
                    <p className="text-xs font-bold text-[#806A5E]">عدد الطلبات</p>
                  </div>
                  <div className="rounded-2xl bg-[#FCF8F3] p-4 text-center">
                    <p className="text-2xl font-black">{formatSar(selected.orderTotal)}</p>
                    <p className="text-xs font-bold text-[#806A5E]">قيمة الطلبات</p>
                  </div>
                  <div className="rounded-2xl bg-[#FCF8F3] p-4 text-center">
                    <p className="text-2xl font-black">{selected.loyaltyEventsCount}</p>
                    <p className="text-xs font-bold text-[#806A5E]">توثيق بطاقة الولاء</p>
                  </div>
                  <div className="rounded-2xl bg-[#FCF8F3] p-4 text-center">
                    <p className="text-2xl font-black">{selected.previousSubmissionsCount}</p>
                    <p className="text-xs font-bold text-[#806A5E]">توثيقات التجارب</p>
                  </div>
                </div>
              </article>

              <article className="rounded-[32px] bg-white p-5 shadow-sm">
                <p className="text-sm font-black text-[#9B6A34]">تفاصيل التوثيق</p>
                <a
                  href={selected.experienceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex max-w-full items-center gap-2 rounded-2xl bg-[#FCF8F3] px-4 py-3 font-black text-[#6B3A25]"
                >
                  <LinkIcon className="h-4 w-4" />
                  <span className="truncate">{selected.experienceUrl}</span>
                  <ExternalLink className="h-4 w-4" />
                </a>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-[#FCF8F3] p-4">
                    <p className="text-xs font-bold text-[#806A5E]">المشاهدات</p>
                    <p className="text-2xl font-black">{selected.currentViews}</p>
                  </div>
                  <div className="rounded-2xl bg-[#FCF8F3] p-4">
                    <p className="text-xs font-bold text-[#806A5E]">التعليقات</p>
                    <p className="text-2xl font-black">{selected.currentComments}</p>
                  </div>
                </div>
                {selected.customerNotes ? (
                  <p className="mt-4 rounded-2xl bg-[#FCF8F3] p-4 text-sm font-bold leading-7 text-[#806A5E]">
                    {selected.customerNotes}
                  </p>
                ) : null}
              </article>

              <article className="rounded-[32px] bg-white p-5 shadow-sm">
                <p className="text-sm font-black text-[#9B6A34]">تحديد المكافأة</p>
                <h2 className="mt-1 text-xl font-black">اختر منتج أو أكثر من المنيو</h2>
                <div className="mt-4 grid max-h-72 gap-3 overflow-y-auto sm:grid-cols-2">
                  {products.map((product) => (
                    <label key={product.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[#E7D7C6] bg-[#FCF8F3] p-3">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedProducts[product.id])}
                        onChange={(event) =>
                          setSelectedProducts((current) => ({
                            ...current,
                            [product.id]: event.target.checked,
                          }))
                        }
                      />
                      <span className="font-black">{product.name}</span>
                    </label>
                  ))}
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-black text-[#806A5E]">صلاحية المكافأة</span>
                    <input
                      type="date"
                      value={expiresAt}
                      onChange={(event) => setExpiresAt(event.target.value)}
                      className="h-12 rounded-2xl border border-[#E7D7C6] px-4 font-bold"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-black text-[#806A5E]">ملاحظات المراجعة</span>
                    <input
                      value={reviewNotes}
                      onChange={(event) => setReviewNotes(event.target.value)}
                      className="h-12 rounded-2xl border border-[#E7D7C6] px-4 font-bold"
                    />
                  </label>
                </div>

                {selected.rewardCode ? (
                  <div className="mt-4 rounded-3xl bg-[#311912] p-4 text-center text-white">
                    <p className="text-xs font-bold text-[#D9A33F]">باركود المكافأة</p>
                    <p className="mt-2 font-mono text-2xl font-black tracking-[0.18em]">
                      {selected.rewardCode}
                    </p>
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void approveSelected()}
                    disabled={busy || selected.status === "redeemed"}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#6B3A25] px-5 py-3 font-black text-white disabled:opacity-50"
                  >
                    <BadgeCheck className="h-5 w-5" />
                    اعتماد التجربة وإصدار المكافأة
                  </button>
                  <button
                    type="button"
                    onClick={() => void rejectSelected()}
                    disabled={busy || selected.status === "redeemed"}
                    className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-5 py-3 font-black text-red-700 disabled:opacity-50"
                  >
                    <XCircle className="h-5 w-5" />
                    رفض التوثيق
                  </button>
                </div>
              </article>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
