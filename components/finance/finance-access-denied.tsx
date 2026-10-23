import Link from "next/link";
import { LockKeyhole } from "lucide-react";
export function FinanceAccessDenied({ slug }: { slug: string }) {
  return <main dir="rtl" className="grid min-h-[70dvh] place-items-center bg-[#FCF8F3] p-6 text-[#38241c]">
    <section className="w-full max-w-md rounded-2xl border border-[#e6dbcf] bg-white p-8 text-center">
      <LockKeyhole className="mx-auto mb-5 h-8 w-8" aria-hidden="true" />
      <h1 className="text-2xl font-bold">المالية غير متاحة لهذا الحساب</h1>
      <p className="my-4 text-sm leading-7 text-[#806c60]">تحقق من تفعيل باقة المالية وصلاحيات دخولك لدى مسؤول العلامة</p>
      <Link className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#38241c] px-5 py-3 font-bold text-white" href={`/finance/${encodeURIComponent(slug)}/login`}>الدخول بحساب آخر</Link>
    </section>
  </main>;
}
