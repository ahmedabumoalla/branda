"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { CafeLayout } from "@/components/cafe/cafe-layout";
import { CustomerPhoneAuthForm } from "@/components/cafe/customer-phone-auth-form";

export default function CafeCustomerRegisterPage() {
  const params = useParams<{ slug: string }>();
  return (
    <CafeLayout
      slug={params.slug}
      className="!px-0 !py-0"
      maxWidth="max-w-[100%]"
      hideHeader
      hideFooter
      hideQuickDock
    >
      <Suspense fallback={<p className="p-8 text-center font-black">جاري التحميل...</p>}>
        <CustomerPhoneAuthForm mode="signup" />
      </Suspense>
    </CafeLayout>
  );
}
