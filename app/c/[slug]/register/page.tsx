"use client";

import { Suspense, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import {
  ThemedAuthPanel,
  ThemedInput,
} from "@/components/cafe/themes/themed-auth-panel";
import { appendPreviewToNextPath } from "@/lib/cafe/theme-links";
import { registerCustomerAction } from "@/app/actions/auth";

function safeCustomerNext(rawNext: string | null, slug: string) {
  const fallback = `/c/${slug}/account`;
  if (!rawNext) return fallback;
  if (rawNext === `/c/${slug}`) return fallback;
  if (!rawNext.startsWith(`/c/${slug}/`)) return fallback;
  if (
    rawNext.includes(`/${slug}/login`) ||
    rawNext.includes(`/${slug}/register`) ||
    rawNext.includes(`/${slug}/reset-password`)
  ) {
    return fallback;
  }
  return rawNext;
}

function PasswordInput({
  value,
  onChange,
  visible,
  onToggle,
  experience,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  experience: ReturnType<typeof useCafePageContext>["experience"];
  placeholder: string;
  autoComplete: string;
}) {
  return (
    <div className="relative">
      <ThemedInput
        experience={experience}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        className="pl-12"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        className="absolute left-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[var(--ci-muted-fg,#806A5E)]"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function RegisterForm() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = params.slug;
  const rawNext = searchParams.get("next");
  const { settings, experience, path, previewThemeId } = useCafePageContext(slug);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  function register() {
    if (loading) return;
    if (!fullName.trim() || !phone.trim() || !email.trim() || !password.trim()) {
      alert("اكتب الاسم ورقم الجوال والبريد وكلمة المرور");
      return;
    }
    if (password.length < 8) {
      alert("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
      return;
    }
    if (password !== confirmPassword) {
      alert("تأكيد كلمة المرور يجب أن يطابق كلمة المرور");
      return;
    }

    setLoading(true);
    void registerCustomerAction(
      slug,
      email.trim(),
      password,
      fullName.trim(),
      phone.trim(),
    ).then((result) => {
      setLoading(false);
      if (!result.ok) {
        alert(result.message);
        return;
      }

      if (result.verificationRequired && result.customerId) {
        const next = safeCustomerNext(rawNext, slug);
        router.replace(
          appendPreviewToNextPath(
            `/c/${slug}/verify-phone?customerId=${encodeURIComponent(result.customerId)}&next=${encodeURIComponent(next)}`,
            previewThemeId,
          ),
        );
        return;
      }

      const destination = result.session
        ? safeCustomerNext(rawNext, slug)
        : `/c/${slug}/login`;
      router.replace(appendPreviewToNextPath(destination, previewThemeId));
    });
  }

  const nextForLogin = appendPreviewToNextPath(
    safeCustomerNext(rawNext, slug),
    previewThemeId,
  );

  return (
    <ThemedAuthPanel
      mode="register"
      settings={settings}
      experience={experience}
      registerHref={path("register")}
      loginHref={`${path("login")}?next=${encodeURIComponent(nextForLogin)}`}
      onSubmit={register}
      submitLabel={loading ? "جاري إنشاء الحساب..." : "إنشاء الحساب"}
    >
      <ThemedInput
        experience={experience}
        value={fullName}
        onChange={(event) => setFullName(event.target.value)}
        placeholder="الاسم"
        autoComplete="name"
      />
      <ThemedInput
        experience={experience}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="البريد الإلكتروني"
        type="email"
        autoComplete="email"
      />
      <ThemedInput
        experience={experience}
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        placeholder="رقم الجوال"
        inputMode="tel"
        autoComplete="tel"
      />
      <p className="text-xs font-bold leading-5 text-[var(--ci-muted-fg,#806A5E)]">
        سنستخدم رقم الجوال لتأكيد الحساب وإرسال تفاصيل الطلبات والحجوزات.
      </p>
      <PasswordInput
        experience={experience}
        value={password}
        onChange={setPassword}
        visible={passwordVisible}
        onToggle={() => setPasswordVisible((value) => !value)}
        placeholder="كلمة المرور"
        autoComplete="new-password"
      />
      <PasswordInput
        experience={experience}
        value={confirmPassword}
        onChange={setConfirmPassword}
        visible={confirmVisible}
        onToggle={() => setConfirmVisible((value) => !value)}
        placeholder="تأكيد كلمة المرور"
        autoComplete="new-password"
      />
    </ThemedAuthPanel>
  );
}

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
        <RegisterForm />
      </Suspense>
    </CafeLayout>
  );
}
