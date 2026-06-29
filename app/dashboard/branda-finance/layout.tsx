import Link from "next/link";
import type { ReactNode } from "react";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { canShowBrandaFinance } from "@/lib/platform/feature-access";

function BrandaFinanceUnavailable() {
  return (
    <main dir="rtl" className="min-h-screen bg-[#F5EFE6] px-4 py-10 text-right text-[#2F241D]">
      <section className="mx-auto flex min-h-[62vh] max-w-2xl items-center justify-center">
        <div className="w-full rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-6 text-center shadow-[0_18px_44px_rgba(69,43,28,0.10)] sm:p-8">
          <p className="text-[12px] font-black text-[#9C6B2E]">ميزة غير ظاهرة في هذه الباقة</p>
          <h1 className="mt-3 text-2xl font-black text-[#2F241D] sm:text-3xl">
            برندة المالية غير مفعلة في هذه الباقة
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm font-bold leading-7 text-[#7D6654]">
            تم إخفاء وحدة برندة المالية وروابطها من هذه العلامة. عند تفعيلها من الباقة ستعود الصفحة والاختصارات تلقائيًا.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-[8px] bg-[#4A281D] px-5 text-sm font-black text-white"
          >
            العودة إلى لوحة التحكم
          </Link>
        </div>
      </section>
    </main>
  );
}

export default async function BrandaFinanceLayout({ children }: { children: ReactNode }) {
  const features = await getOwnerFeatureCodes().catch(() => []);

  if (!canShowBrandaFinance({ features })) {
    return <BrandaFinanceUnavailable />;
  }

  return children;
}
