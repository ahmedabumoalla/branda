import Link from "next/link";
import { ArrowLeft, Clock3 } from "lucide-react";

export function SubscriptionExpiredState() {
  return <section dir="rtl" className="mx-auto my-12 max-w-2xl rounded-3xl border border-[#ded5c4] bg-[#fffdf8] px-6 py-12 text-center text-[#2d2922] sm:px-12" aria-labelledby="expired-subscription-title">
    <span className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-[#f2e9d7] text-[#805b20]"><Clock3 size={30} aria-hidden="true" /></span>
    <p className="mb-3 text-sm font-bold text-[#805b20]">الباقات والاشتراكات</p>
    <h1 id="expired-subscription-title" className="text-2xl font-bold sm:text-3xl">انتهى اشتراككم مع برندة</h1>
    <p className="mt-4 leading-8 text-[#71695c]">توقفت خدمات علامتكم حتى تفعيل الاشتراك اختر الباقة المناسبة لمتابعة العمل</p>
    <Link href="/dashboard/subscription" className="mt-8 inline-flex min-h-12 items-center justify-center gap-3 rounded-xl bg-[#38251b] px-6 py-3 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#805b20]">الانتقال إلى الباقات والاشتراكات<ArrowLeft size={18} aria-hidden="true" /></Link>
  </section>;
}
