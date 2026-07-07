import type { ReactNode } from "react";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { hasBrandFeature } from "@/lib/data/feature-entitlements";

type Props = {
  brandId?: string;
  featureKey: string;
  children: ReactNode;
  fallback?: ReactNode;
  hideWhenLocked?: boolean;
};

function DefaultUpgradeFallback() {
  return (
    <div dir="rtl" className="rounded-2xl border border-[#E7D7C6] bg-[#FCF8F3] p-5 text-center text-[#311912]">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4A281D]/10 text-[#4A281D]">
        <LockKeyhole className="h-6 w-6" />
      </span>
      <p className="mt-3 text-sm font-black text-[#806A5E]">
        هذه الميزة غير مفعلة في الباقة الحالية.
      </p>
      <Link href="/dashboard/subscription" className="mt-4 inline-flex rounded-xl bg-[#4A281D] px-4 py-3 text-sm font-black text-white">
        عرض الباقات
      </Link>
    </div>
  );
}

export async function FeatureGate({
  brandId,
  featureKey,
  children,
  fallback,
  hideWhenLocked = false,
}: Props) {
  const enabled = brandId ? await hasBrandFeature(brandId, featureKey) : false;
  if (enabled) return <>{children}</>;
  if (hideWhenLocked) return null;
  return <>{fallback ?? <DefaultUpgradeFallback />}</>;
}
