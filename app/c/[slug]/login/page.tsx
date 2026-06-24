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
import {
  loginCustomerAction,
  requestCustomerPasswordResetAction,
} from "@/app/actions/auth";
import {
  clearCachedCustomerSession,
  waitForConfirmedCustomerSession,
} from "@/lib/customer/session";

const LOGIN_TIMEOUT_MS = 5_000;
const SESSION_CONFIRM_TIMEOUT_MS = 5_000;

function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("timeout"));
    }, timeoutMs);

    task.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

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

function PasswordInput({
  value,
  onChange,
  visible,
  onToggle,
  experience,
}: {
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  experience: ReturnType<typeof useCafePageContext>["experience"];
}) {
  return (
    <div className="relative">
      <ThemedInput
        experience={experience}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="كلمة المرور"
        type={visible ? "text" : "password"}
        autoComplete="current-password"
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

function LoginForm() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = params.slug;
  const rawNext = searchParams.get("next");
  const { settings, experience, path, previewThemeId } = useCafePageContext(slug);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  function login() {
    if (loading) return;
    if (!email.trim() || !password.trim()) {
      alert("اكتب البريد أو رقم الجوال وكلمة المرور");
      return;
    }

    setLoading(true);
    void withTimeout(
      loginCustomerAction(slug, email.trim(), password),
      LOGIN_TIMEOUT_MS,
    )
      .then(async (result) => {
        if (!result.ok || !result.session) {
          if (result.ok && result.verificationRequired && result.customerId) {
            const destination = safeCustomerNext(rawNext, slug);
            router.replace(
              appendPreviewToNextPath(
                `/c/${slug}/verify-phone?customerId=${encodeURIComponent(result.customerId)}&next=${encodeURIComponent(destination)}`,
                previewThemeId,
              ),
            );
            return;
          }
          alert(result.message || "تعذر تسجيل الدخول");
          return;
        }

        clearCachedCustomerSession(slug);
        const confirmedSession = await waitForConfirmedCustomerSession(
          slug,
          SESSION_CONFIRM_TIMEOUT_MS,
        );
        if (!confirmedSession) {
          alert("تم قبول بيانات الدخول، لكن لم تتأكد جلسة العميل بعد. حدّث الصفحة أو حاول مرة أخرى.");
          return;
        }

        const destination = safeCustomerNext(rawNext, slug);
        router.refresh();
        router.replace(appendPreviewToNextPath(destination, previewThemeId));
      })
      .catch(() => {
        alert("تعذر إكمال تسجيل الدخول خلال الوقت المتوقع. حاول مرة أخرى.");
      })
      .finally(() => {
        setLoading(false);
      });
  }

  function submitReset() {
    const requestedEmail = (resetEmail || email).trim();
    if (!requestedEmail) {
      alert("اكتب البريد الإلكتروني أولًا");
      return;
    }

    setResetLoading(true);
    setResetMessage("");

    void requestCustomerPasswordResetAction(slug, requestedEmail)
      .then((result) => {
        setResetMessage(result.message);
      })
      .finally(() => {
        setResetLoading(false);
      });
  }

  const nextForRegister = appendPreviewToNextPath(
    safeCustomerNext(rawNext, slug),
    previewThemeId,
  );

  return (
    <ThemedAuthPanel
      mode="login"
      settings={settings}
      experience={experience}
      registerHref={`${path("register")}?next=${encodeURIComponent(nextForRegister)}`}
      loginHref={path("login")}
      onSubmit={login}
      submitLabel={loading ? "جاري الدخول..." : "تسجيل الدخول"}
    >
      <ThemedInput
        experience={experience}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="البريد الإلكتروني أو رقم الجوال"
        type="text"
        autoComplete="username"
      />
      <p className="text-xs font-bold leading-5 text-[var(--ci-muted-fg,#806A5E)]">
        يمكنك الدخول بالبريد أو رقم الجوال الموثق.
      </p>
      <PasswordInput
        experience={experience}
        value={password}
        onChange={setPassword}
        visible={passwordVisible}
        onToggle={() => setPasswordVisible((value) => !value)}
      />
      <button
        type="button"
        onClick={() => {
          setResetEmail(email);
          setResetMessage("");
          setResetOpen((value) => !value);
        }}
        className="text-xs font-black text-[var(--ci-primary-bg,var(--barndaksa-brand-brown))] underline"
      >
        نسيت كلمة المرور؟
      </button>

      {resetOpen ? (
        <div className="rounded-2xl border border-black/10 bg-[var(--ci-page-bg,#FCF8F3)] p-3">
          <p className="text-sm font-black text-[var(--ci-page-fg,#171412)]">
            استعادة كلمة المرور
          </p>
          <ThemedInput
            experience={experience}
            value={resetEmail}
            onChange={(event) => setResetEmail(event.target.value)}
            placeholder="البريد الإلكتروني"
            type="email"
            className="mt-3"
          />
          {resetMessage ? (
            <p className="mt-3 text-xs font-bold leading-5 text-[var(--ci-muted-fg,#806A5E)]">
              {resetMessage}
            </p>
          ) : null}
          <button
            type="button"
            onClick={submitReset}
            disabled={resetLoading}
            className="mt-3 w-full rounded-2xl bg-[var(--ci-button-bg,var(--barndaksa-brand-brown))] px-5 py-3 text-sm font-black text-[var(--ci-button-fg,#fff)] disabled:opacity-60"
          >
            {resetLoading ? "جاري إرسال الرابط..." : "إرسال رابط الاستعادة"}
          </button>
        </div>
      ) : null}
    </ThemedAuthPanel>
  );
}

export default function CafeCustomerLoginPage() {
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
        <LoginForm />
      </Suspense>
    </CafeLayout>
  );
}
