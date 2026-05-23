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

function RegisterForm() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = params.slug;
  const rawNext = searchParams.get("next") || `/c/${slug}`;
  const { settings, experience, path, previewThemeId } = useCafePageContext(slug);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  function register() {
    if (!fullName.trim() || !phone.trim()) {
      alert("اكتب الاسم ورقم الجوال");
      return;
    }
    setCustomerSession(slug, {
      id: crypto.randomUUID(),
      cafeSlug: slug,
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    router.push(appendPreviewToNextPath(rawNext, previewThemeId));
  }

  const nextForLogin = appendPreviewToNextPath(rawNext, previewThemeId);

  return (
    <ThemedAuthPanel
      mode="register"
      settings={settings}
      experience={experience}
      registerHref={path("register")}
      loginHref={`${path("login")}?next=${encodeURIComponent(nextForLogin)}`}
      onSubmit={register}
      submitLabel="إنشاء الحساب"
    >
      <ThemedInput
        experience={experience}
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder="الاسم الكامل"
      />
      <ThemedInput
        experience={experience}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="رقم الجوال"
      />
      <ThemedInput
        experience={experience}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="البريد (اختياري)"
        type="email"
      />
    </ThemedAuthPanel>
  );
}

export default function CafeCustomerRegisterPage() {
  const params = useParams<{ slug: string }>();
  return (
    <CafeLayout slug={params.slug} className="max-w-lg py-8" maxWidth="max-w-lg">
      <Suspense fallback={<p className="text-center font-black">جاري التحميل...</p>}>
        <RegisterForm />
      </Suspense>
    </CafeLayout>
  );
}
