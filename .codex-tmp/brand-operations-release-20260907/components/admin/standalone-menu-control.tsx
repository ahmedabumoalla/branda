"use client";

import { useEffect, useState } from "react";
import { getStandaloneMenuPublicationAction, setStandaloneMenuPublicationAction } from "@/app/actions/standalone-menu";

export function StandaloneMenuControl({ cafeId, slug }: { cafeId: string; slug: string }) {
  const [published, setPublished] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    getStandaloneMenuPublicationAction(cafeId).then((value) => {
      if (!cancelled) setPublished(value);
    }).catch(() => { if (!cancelled) setError("تعذر تحميل حالة المنيو. أعد فتح تفاصيل العلامة."); });
    return () => { cancelled = true; };
  }, [cafeId]);

  async function toggle() {
    if (published === null || busy) return;
    setBusy(true);
    setError("");
    try { setPublished(await setStandaloneMenuPublicationAction(cafeId, !published)); }
    catch { setError("تعذر حفظ حالة المنيو. حاول مجددًا."); }
    finally { setBusy(false); }
  }

  return <section className="mb-6 rounded-2xl border border-[#F6C35B]/25 bg-[#F6C35B]/5 p-4" aria-label="نشر المنيو المستقل">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h4 className="font-black text-[#F8F4EF]">المنيو المستقل</h4>
        <p className="mt-1 text-sm text-[#CBB29C]">يبقى متاحًا عند إيقاف الحساب، ولا يرتبط بالباقة أو الفرع الإلكتروني.</p>
        <a href={`/menu/${encodeURIComponent(slug)}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-[#F6C35B] underline">فتح صفحة المنيو ↗</a>
      </div>
      <button type="button" onClick={toggle} disabled={published === null || busy}
        className="min-h-11 rounded-xl border border-[#F6C35B]/40 px-5 py-2 font-bold text-[#F6C35B] disabled:opacity-50">
        {busy ? "جار الحفظ" : published === null ? "جار التحميل" : published ? "إيقاف المنيو" : "نشر المنيو"}
      </button>
    </div>
    <p className="mt-2 text-xs text-[#CBB29C]" role="status">{published === true ? "المنيو منشور" : published === false ? "المنيو غير منشور" : ""}</p>
    {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
  </section>;
}
