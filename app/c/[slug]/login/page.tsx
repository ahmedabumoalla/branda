"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import {
  ThemedAuthPanel,
  ThemedInput,
} from "@/components/cafe/themes/themed-auth-panel";
import { appendPreviewToNextPath } from "@/lib/cafe/theme-links";
import { setCustomerSession } from "@/lib/customer/session";

function LoginForm() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = params.slug;
  const rawNext = searchParams.get("next") || `/c/${slug}`;
  const { settings, experience, path, previewThemeId, nextPath } = useCafePageContext(slug);

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");

  function login() {
    if (!phone.trim()) {
      alert("اكتب رقم الجوال");
      return;
    }
    setCustomerSession(slug, {
      id: `customer_${phone.trim()}`,
      cafeSlug: slug,
      fullName: name.trim() || "عميل",
      phone: phone.trim(),
      createdAt: new Date().toISOString(),
    });
    router.push(appendPreviewToNextPath(rawNext, previewThemeId));
  }

  const nextForRegister = appendPreviewToNextPath(rawNext, previewThemeId);

  return (
    <ThemedAuthPanel
      mode="login"
      settings={settings}
      experience={experience}
      registerHref={`${path("register")}?next=${encodeURIComponent(nextForRegister)}`}
      loginHref={path("login")}
      onSubmit={login}
      submitLabel="دخول ومتابعة"
    >
      <ThemedInput
        experience={experience}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="الاسم (اختياري)"
      />
      <ThemedInput
        experience={experience}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="رقم الجوال"
      />
    </ThemedAuthPanel>
  );
}

export default function CafeCustomerLoginPage() {
  const params = useParams<{ slug: string }>();
  return (
    <CafeLayout slug={params.slug} className="max-w-lg py-8" maxWidth="max-w-lg">
      <Suspense fallback={<p className="text-center font-black">جاري التحميل...</p>}>
        <LoginForm />
      </Suspense>
    </CafeLayout>
  );
}
