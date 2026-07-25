"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  completeCustomerPhoneOtpAction,
  requestCustomerPhoneOtpAction,
} from "@/app/actions/auth";
import { useCafePageContext } from "@/components/cafe/cafe-layout";
import {
  ThemedAuthPanel,
  ThemedInput,
} from "@/components/cafe/themes/themed-auth-panel";
import { appendPreviewToNextPath } from "@/lib/cafe/theme-links";
import { primeCustomerSessionCache } from "@/lib/customer/session";

type CustomerPhoneAuthMode = "signup" | "login";

function safeCustomerNext(rawNext: string | null, slug: string) {
  const fallback = `/c/${slug}/account`;
  const cafeRoot = `/c/${slug}`;
  if (!rawNext) return fallback;
  if (rawNext === cafeRoot || rawNext.startsWith(`${cafeRoot}?`)) return rawNext;
  if (!rawNext.startsWith(`${cafeRoot}/`)) return fallback;
  const nextPath = rawNext.split(/[?#]/)[0] ?? rawNext;
  if (
    nextPath === `${cafeRoot}/login` ||
    nextPath === `${cafeRoot}/register` ||
    nextPath === `${cafeRoot}/reset-password`
  ) {
    return fallback;
  }
  return rawNext;
}

export function CustomerPhoneAuthForm({
  mode,
}: {
  mode: CustomerPhoneAuthMode;
}) {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = params.slug;
  const rawNext = searchParams.get("next");
  const { settings, experience, path, previewThemeId } =
    useCafePageContext(slug);
  const purpose =
    mode === "signup" ? ("customer_signup" as const) : ("customer_login" as const);
  const storageKey = `branda:customer-phone-auth:${slug}:${purpose}`;

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [pending, setPending] = useState<"send" | "verify" | "resend" | null>(
    null,
  );
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(storageKey);
      if (!saved) return;
      const parsed = JSON.parse(saved) as {
        phone?: string;
        maskedPhone?: string;
        resendAt?: number;
      };
      if (mode === "signup") {
        window.sessionStorage.removeItem(storageKey);
        return;
      }
      if (!parsed.phone || !parsed.maskedPhone) return;
      setPhone(parsed.phone);
      setMaskedPhone(parsed.maskedPhone);
      setResendSeconds(
        Math.max(0, Math.ceil(((parsed.resendAt ?? 0) - Date.now()) / 1000)),
      );
      setStage("code");
    } catch {
      window.sessionStorage.removeItem(storageKey);
    }
  }, [mode, storageKey]);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setResendSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  function rememberStep(masked: string, seconds: number) {
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        phone: phone.trim(),
        maskedPhone: masked,
        resendAt: Date.now() + seconds * 1000,
      }),
    );
  }

  function changePhone() {
    setStage("phone");
    setCode("");
    setMaskedPhone("");
    setResendSeconds(0);
    window.sessionStorage.removeItem(storageKey);
  }

  async function sendOtp(kind: "send" | "resend") {
    if (pending || (kind === "resend" && resendSeconds > 0)) return;
    if (mode === "signup") {
      const normalizedName = fullName.trim();
      if (normalizedName.length < 2 || normalizedName.length > 120) {
        alert("أدخل اسمًا صحيحًا من حرفين إلى 120 حرفًا.");
        return;
      }
      if (normalizedName !== fullName) setFullName(normalizedName);
    }
    if (!phone.trim()) {
      alert("أدخل رقم الجوال.");
      return;
    }

    setPending(kind);
    try {
      const result = await requestCustomerPhoneOtpAction(
        slug,
        phone.trim(),
        purpose,
      );
      if (!result.required || !result.ok) {
        if (result.required && result.retryAfterSeconds) {
          setResendSeconds(result.retryAfterSeconds);
        }
        alert(
          result.required
            ? result.message
            : "خدمة التحقق غير متاحة لهذه العلامة حاليًا.",
        );
        return;
      }

      setMaskedPhone(result.maskedPhone);
      setResendSeconds(result.resendAfterSeconds);
      setCode("");
      setStage("code");
      rememberStep(result.maskedPhone, result.resendAfterSeconds);
    } finally {
      setPending(null);
    }
  }

  async function verifyOtp() {
    if (pending) return;
    if (!/^\d{6}$/.test(code)) {
      alert("أدخل رمز التحقق المكوّن من 6 أرقام.");
      return;
    }

    setPending("verify");
    try {
      const result = await completeCustomerPhoneOtpAction(
        slug,
        phone.trim(),
        code,
        purpose,
        mode === "signup" ? fullName.trim() : undefined,
      );
      if (!result.ok || !result.session) {
        alert(result.message);
        return;
      }

      window.sessionStorage.removeItem(storageKey);
      primeCustomerSessionCache(slug, result.session);
      const destination = safeCustomerNext(rawNext, slug);
      router.replace(appendPreviewToNextPath(destination, previewThemeId));
    } finally {
      setPending(null);
    }
  }

  const destination = appendPreviewToNextPath(
    safeCustomerNext(rawNext, slug),
    previewThemeId,
  );
  const registerHref = `${path("register")}?next=${encodeURIComponent(destination)}`;
  const loginHref = `${path("login")}?next=${encodeURIComponent(destination)}`;

  return (
    <ThemedAuthPanel
      mode={mode === "signup" ? "register" : "login"}
      settings={settings}
      experience={experience}
      registerHref={registerHref}
      loginHref={loginHref}
      onSubmit={() => {
        if (stage === "phone") void sendOtp("send");
        else void verifyOtp();
      }}
      submitLabel={
        stage === "phone"
          ? pending === "send"
            ? "جاري إرسال الرمز..."
            : "إرسال رمز التحقق"
          : pending === "verify"
            ? "جاري التحقق..."
            : mode === "signup"
              ? "تحقق وأنشئ الحساب"
              : "تحقق وسجّل الدخول"
      }
    >
      {mode === "signup" ? (
        <ThemedInput
          experience={experience}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="الاسم"
          autoComplete="name"
          minLength={2}
          maxLength={120}
          required
          disabled={stage === "code"}
        />
      ) : null}
      <ThemedInput
        experience={experience}
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        placeholder="رقم الجوال"
        inputMode="tel"
        autoComplete="tel"
        disabled={stage === "code"}
        dir="ltr"
      />
      <p className="text-xs font-bold leading-5 text-[var(--ci-muted-fg,#806A5E)]">
        سيصلك رمز تحقق عبر واتساب بعد الضغط على زر الإرسال.
      </p>

      {stage === "code" ? (
        <div className="rounded-2xl border border-[var(--ci-border,#E7D7C6)] bg-[var(--ci-surface,#FCF8F3)] p-4">
          <p className="text-sm font-black text-[var(--ci-fg,#311912)]">
            أرسلنا رمز التحقق إلى {maskedPhone}
          </p>
          <button
            type="button"
            onClick={changePhone}
            disabled={pending !== null}
            className="mt-2 text-xs font-black text-[var(--ci-accent,#6B3A25)] underline underline-offset-4 disabled:opacity-50"
          >
            تغيير رقم الجوال ({maskedPhone})
          </button>
          <ThemedInput
            experience={experience}
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="رمز التحقق من 6 أرقام"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            dir="ltr"
            className="mt-3 text-center tracking-[0.35em]"
          />
          <button
            type="button"
            onClick={() => void sendOtp("resend")}
            disabled={pending !== null || resendSeconds > 0}
            className="mt-3 text-xs font-black text-[var(--ci-accent,#6B3A25)] disabled:opacity-50"
          >
            {pending === "resend"
              ? "جاري إعادة الإرسال..."
              : resendSeconds > 0
                ? `إعادة الإرسال بعد ${resendSeconds} ثانية`
                : "إعادة إرسال الرمز"}
          </button>
        </div>
      ) : null}
    </ThemedAuthPanel>
  );
}
