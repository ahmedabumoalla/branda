import Link from "next/link";

export function StandaloneMenuControl() {
  return <section className="rounded-2xl border border-[#F6C35B]/25 bg-[#F6C35B]/5 p-5" aria-label="إتاحة المنيو المستقل">
    <h3 className="font-black text-[#F8F4EF]">المنيو مرتبط بالباقة</h3>
    <p className="mt-2 text-sm leading-7 text-[#CBB29C]">
      يعمل المنيو المستقل عند وجود اشتراك ساري في باقة مفعلة تتضمن خدمة المنيو، مع تفعيل العلامة والخدمة.
      عند انتهاء الاشتراك أو إيقاف الخدمة يتوقف المنيو تلقائيًا.
    </p>
    <Link href="/admin/plans" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-[#F6C35B]/40 px-5 py-2 font-bold text-[#F6C35B] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F6C35B]">
      إدارة خدمات الباقات
    </Link>
  </section>;
}
