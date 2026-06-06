
"use client";

import type { CafeInfoPage } from "@/lib/mock/cafe-pages";

export function PublicInfoPagesSection({ pages }: { pages: CafeInfoPage[] }) {
  if (!pages.length) return null;
  return <section dir="rtl" className="mx-auto w-full max-w-6xl px-4 py-10"><div className="mb-5"><p className="font-black text-[#6B3A25]">صفحات تعريفية</p><h2 className="mt-2 text-3xl font-black text-[#311912]">معلومات تهم العميل</h2></div><div className="grid gap-4 md:grid-cols-3">{pages.map((page) => <article key={page.id} className="rounded-[28px] border border-[#E5D8CD] bg-white p-5 shadow-sm"><h3 className="text-xl font-black text-[#311912]">{page.title}</h3><p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">{page.description || page.content.slice(0, 120)}</p></article>)}</div></section>;
}
