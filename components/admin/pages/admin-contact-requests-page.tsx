"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Phone, Inbox } from "lucide-react";
import { updateContactStatusAction } from "@/app/actions/contact-requests";
import type { ContactRequest } from "@/lib/platform/contact-requests";

const statuses = { new: "جديد", reviewing: "قيد المتابعة", closed: "مغلق" } as const;

function RequestCard({ request }: { request: ContactRequest }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function change(status: string) {
    setBusy(true); setError("");
    try {
      const result = await updateContactStatusAction(request.id, status);
      if (!result.ok) throw new Error();
      router.refresh();
    } catch { setError("تعذر حفظ الحالة حاول مجددًا"); }
    finally { setBusy(false); }
  }
  return <article className="rounded-2xl border border-white/10 bg-[#191714] p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 break-words"><h2 className="text-lg font-bold">{request.fullName}</h2><p className="mt-1 text-sm text-[#CBB29C]">{request.business || "طلب تواصل"}{request.businessType ? ` — ${request.businessType}` : ""}</p></div>
      <label className="flex items-center gap-3 text-sm text-[#CBB29C]">حالة الطلب<select aria-label={`حالة طلب ${request.fullName}`} value={request.status} disabled={busy} onChange={event => change(event.target.value)} className="min-h-11 rounded-xl border border-white/15 bg-[#241b15] px-3 text-[#F6C35B]">{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
      {request.phone && <><a className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3" href={`tel:+${request.phone}`}><Phone size={16} /><bdi>{`0${request.phone.slice(3)}`}</bdi></a><a className="flex min-h-11 items-center gap-2 rounded-xl border border-[#9BD6AB]/25 px-3 text-[#9BD6AB]" href={`https://wa.me/${request.phone}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={17} />واتساب</a></>}
      {request.email && <a className="break-all text-[#F6C35B]" href={`mailto:${request.email}`}>{request.email}</a>}
      {request.selectedPlan && <span className="rounded-xl bg-[#F6C35B]/10 px-3 py-2 text-[#F6C35B]">{request.selectedPlan}</span>}
    </div>
    {!request.business && <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-8 text-[#CBB29C]">{request.message}</p>}
    <time dateTime={request.createdAt} className="mt-4 block text-xs text-[#CBB29C]">{new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(request.createdAt))}</time>
    {busy && <p role="status" className="mt-3 text-sm">جارٍ حفظ الحالة</p>}{error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
  </article>;
}

export function AdminContactRequestsPage({ requests, count, page, error }: { requests: ContactRequest[]; count: number; page: number; error?: string }) {
  return <section className="mx-auto max-w-6xl p-4 sm:p-8" dir="rtl"><header className="mb-7"><p className="mb-2 text-sm text-[#F6C35B]">تواصل العملاء</p><h1 className="text-3xl font-black">طلبات التواصل</h1><p className="mt-3 text-sm text-[#CBB29C]">طلبات الصفحة الرئيسية وبيانات المهتمين بباقات برندة</p></header>
    {error ? <div role="alert" className="rounded-xl border border-red-400/20 p-6 text-red-300">{error} <Link href="/admin/contact-requests" className="underline">إعادة المحاولة</Link></div> : <>
      <p className="mb-4 text-sm text-[#CBB29C]">إجمالي الطلبات {count}</p>
      <div className="grid gap-4">{requests.map(request => <RequestCard key={request.id} request={request} />)}</div>
      {!requests.length && <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center text-[#CBB29C]"><Inbox className="mx-auto mb-4" /><p>لا توجد طلبات تواصل في هذه الصفحة</p><p className="mt-2 text-sm">ستظهر هنا الطلبات المرسلة من نموذج الصفحة الرئيسية</p></div>}
      <nav aria-label="صفحات طلبات التواصل" className="mt-6 flex items-center justify-between gap-4 text-sm">{page > 1 ? <Link className="rounded-xl border border-white/15 px-4 py-3" href={`/admin/contact-requests?page=${page - 1}`}>السابق</Link> : <span />}<span>صفحة {page}</span>{page * 30 < count ? <Link className="rounded-xl border border-white/15 px-4 py-3" href={`/admin/contact-requests?page=${page + 1}`}>التالي</Link> : <span />}</nav>
    </>}
  </section>;
}
