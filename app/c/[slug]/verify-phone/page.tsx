"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import {
  ThemedAuthPanel,
  ThemedInput,
} from "@/components/cafe/themes/themed-auth-panel";
import { appendPreviewToNextPath } from "@/lib/cafe/theme-links";
import {
  getCustomerPhoneVerificationStateAction,
  resendCustomerPhoneCodeAction,
  verifyCustomerPhoneCodeAction,
} from "@/app/actions/auth";
import { clearCachedCustomerSession } from "@/lib/customer/session";

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
    nextPath === `${cafeRoot}/verify-phone` ||
    nextPath === `${cafeRoot}/reset-password`
  ) {
    return fallback;
  }
  return rawNext;
}

function VerifyPhoneForm() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = params.slug;
  const customerId = searchParams.get("customerId") ?? "";
  const rawNext = searchParams.get("next");
  const { settings, experience, path, previewThemeId } = useCafePageContext(slug);

  const [code, setCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const destination = useMemo(() => safeCustomerNext(rawNext, slug), [rawNext, slug]);

  useEffect(() => {
    if (!customerId) {
      setMessage("رابط التحقق غير مكتمل.");
      return;
    }

    let active = true;
    void getCustomerPhoneVerificationStateAction(slug, customerId).then((state) => {
      if (!active) return;
      if (!state.ok) {
        setMessage(state.message || "تعذر تحميل حالة التحقق.");
        return;
      }
      setMaskedPhone(state.maskedPhone || "");
      setCooldown(Math.max(0, state.cooldownSeconds ?? 0));
    });

    return () => {
      active = false;
    };
  }, [customerId, slug]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  function verify() {
    if (loading || !customerId) return;
    const normalizedCode = code.replace(/\D/g, "").slice(0, 6);
    if (normalizedCode.length !== 6) {
      setMessage("أدخل كودا من 6 أرقام.");
      return;
    }

    setLoading(true);
    setMessage("");
    void verifyCustomerPhoneCodeAction(slug, customerId, normalizedCode)
      .then((result) => {
        if (!result.ok) {
          setMessage(result.message || "الكود غير صحيح.");
          return;
        }

        clearCachedCustomerSession(slug);
        router.refresh();
        router.replace(appendPreviewToNextPath(destination, previewThemeId));
      })
      .finally(() => setLoading(false));
  }

  function resend() {
    if (resending || cooldown > 0 || !customerId) return;
    setResending(true);
    setMessage("");
    void resendCustomerPhoneCodeAction(slug, customerId)
      .then((result) => {
        if (!result.ok) {
          setMessage(result.message || "تعذر إرسال الكود.");
        } else {
          setMessage("تم إرسال كود جديد عبر واتساب.");
        }
        if ("maskedPhone" in result && result.maskedPhone) {
          setMaskedPhone(result.maskedPhone);
        }
        setCooldown(Math.max(0, result.cooldownSeconds ?? 60));
      })
      .finally(() => setResending(false));
  }

  return (
    <ThemedAuthPanel
      mode="login"
      settings={settings}
      experience={experience}
      registerHref={`${path("register")}?next=${encodeURIComponent(destination)}`}
      loginHref={`${path("login")}?next=${encodeURIComponent(destination)}`}
      onSubmit={verify}
      submitLabel={loading ? "جاري التأكيد..." : "تأكيد رقم الجوال"}
    >
      <div className="rounded-2xl border border-black/10 bg-[var(--ci-page-bg,#FCF8F3)] p-3 text-right">
        <div className="flex items-center justify-end gap-2 text-sm font-black text-[var(--ci-page-fg,#171412)]">
          <span>{maskedPhone || "رقم الجوال"}</span>
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        </div>
        <p className="mt-2 text-xs font-bold leading-5 text-[var(--ci-muted-fg,#806A5E)]">
          أدخل كود التحقق المرسل عبر واتساب لإكمال تفعيل الحساب واستقبال تفاصيل الطلبات والحجوزات.
        </p>
      </div>

      <ThemedInput
        experience={experience}
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="كود التحقق"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        className="text-center text-xl tracking-[0.25em]"
      />

      {message ? (
        <p className="text-center text-xs font-bold leading-5 text-[var(--ci-muted-fg,#806A5E)]">
          {message}
        </p>
      ) : null}

      <button
        type="button"
        onClick={resend}
        disabled={resending || cooldown > 0 || !customerId}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--ci-border,#E7D7C6)] bg-white px-4 text-sm font-black text-[var(--ci-page-fg,#171412)] disabled:opacity-60"
      >
        <RotateCcw className="h-4 w-4" />
        {cooldown > 0
          ? `إعادة الإرسال بعد ${cooldown} ثانية`
          : resending
            ? "جاري الإرسال..."
            : "إعادة إرسال الكود"}
      </button>
    </ThemedAuthPanel>
  );
}

export default function CafeCustomerVerifyPhonePage() {
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
        <VerifyPhoneForm />
      </Suspense>
    </CafeLayout>
  );
}
