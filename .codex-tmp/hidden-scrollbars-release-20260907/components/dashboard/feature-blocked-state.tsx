import Link from "next/link";
import { LockKeyhole } from "lucide-react";

type Props = {
  title: string;
  backHref?: string;
};

export function DashboardFeatureBlockedState({
  title,
  backHref = "/dashboard/subscription",
}: Props) {
  return (
    <div dir="rtl" className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center px-4 py-12">
      <div className="rounded-[32px] border border-[#E7D7C6] bg-[#FCF8F3] p-8 text-center shadow-[0_20px_60px_rgba(49,25,18,0.12)]">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4A281D]/10 text-[#4A281D]">
          <LockKeyhole className="h-7 w-7" />
        </span>
        <p className="mt-4 text-sm font-black text-[#806A5E]">
          الميزة غير مفعلة في باقتك الحالية
        </p>
        <h1 className="mt-3 text-3xl font-black text-[#311912]">{title}</h1>
        <p className="mt-4 font-bold leading-8 text-[#806A5E]">
          تم إخفاء هذه الميزة من التنقل، وهذا المسار المباشر يعرض حالة آمنة بدل تشغيل أدوات غير متاحة ضمن الباقة.
        </p>
        <Link href={backHref} className="mt-6 inline-flex rounded-2xl bg-[#4A281D] px-6 py-4 font-black text-white">
          العودة للباقات
        </Link>
      </div>
    </div>
  );
}
