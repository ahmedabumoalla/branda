"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, Plus } from "lucide-react";
import { saveSalonAnnouncementAction } from "@/app/actions/salon";
import type { SalonAnnouncement } from "@/lib/salon/types";
export function SalonAnnouncementsEditor({ initial, services }: { initial: SalonAnnouncement[]; services: { id: string; name: string }[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<SalonAnnouncement | null>(null);
  const [pending, transition] = useTransition();
  const [message, setMessage] = useState("");
  const field = "min-h-11 w-full rounded-xl border border-[#BCA477]/40 bg-transparent p-3 text-sm";
  return <section className="m-4 rounded-2xl border border-[#BCA477]/30 p-5 sm:m-6" dir="rtl"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="flex items-center gap-2 text-xl font-bold"><Megaphone size={20} aria-hidden="true" /> جديد الصالون</h2><p className="mt-2 text-sm opacity-70">أعلن عن خدمة جديدة أو خبر لعملائك يظهر مباشرة في صفحة الصالون</p></div><button type="button" className="flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm" onClick={() => { setDraft({ id: crypto.randomUUID(), title: "", description: "", active: true, service_id: null }); setMessage(""); }} disabled={pending}><Plus size={16} aria-hidden="true" /> إعلان جديد</button></div>
    <div className="mt-4 flex flex-wrap gap-2">{initial.map(ad => <button key={ad.id} className="rounded-xl border border-[#BCA477]/30 px-4 py-3 text-sm" onClick={() => { setDraft(ad); setMessage(""); }} disabled={pending}>{ad.title} — {ad.active ? "منشور" : "مخفي"}</button>)}</div>
    {draft && <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); setMessage(""); transition(async () => { const result = await saveSalonAnnouncementAction(draft); if (result.ok) { setMessage("تم حفظ الإعلان"); setDraft(null); router.refresh(); } else setMessage(result.error); }); }}>
      <label className="grid gap-2 text-xs">عنوان الإعلان<input className={field} required minLength={2} maxLength={120} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} disabled={pending} /></label>
      <label className="grid gap-2 text-xs">الخدمة المرتبطة اختياري<select className={field} value={draft.service_id ?? ""} onChange={e => setDraft({ ...draft, service_id: e.target.value || null })} disabled={pending}><option value="">إعلان عام</option>{services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="grid gap-2 text-xs sm:col-span-2">نص الإعلان<textarea className={field} rows={3} maxLength={1200} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} disabled={pending} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} disabled={pending} /> نشر في صفحة الصالون</label><div className="flex gap-2"><button disabled={pending} className="min-h-11 rounded-xl bg-[#D5B580] px-5 text-sm font-bold text-[#171714]">{pending ? "جارٍ الحفظ" : "حفظ الإعلان"}</button><button type="button" disabled={pending} onClick={() => setDraft(null)} className="min-h-11 px-4 text-sm">إلغاء</button></div>
    </form>}{message && <p className="mt-4 text-sm" role="status">{message}</p>}
  </section>;
}
