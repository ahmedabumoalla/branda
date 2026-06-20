"use client";



import { useParams, useRouter, useSearchParams } from "next/navigation";

import { Suspense, useState } from "react";

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

const LOGIN_TIMEOUT_MS = 5_000;

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



function LoginForm() {

  const router = useRouter();

  const params = useParams<{ slug: string }>();

  const searchParams = useSearchParams();

  const slug = params.slug;

  const rawNext = searchParams.get("next") || `/c/${slug}`;

  const { settings, experience, path, previewThemeId } = useCafePageContext(slug);



  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");



  function login() {

    if (!email.trim() || !password.trim()) {

      alert("اكتب البريد وكلمة المرور");

      return;

    }

    setLoading(true);

    void withTimeout(
      loginCustomerAction(slug, email.trim(), password),
      LOGIN_TIMEOUT_MS,
    )
      .then((result) => {
        if (!result.ok) {
          alert(result.message);
          return;
        }

        router.replace(appendPreviewToNextPath(`/c/${slug}`, previewThemeId));
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



  const nextForRegister = appendPreviewToNextPath(rawNext, previewThemeId);



  return (

    <ThemedAuthPanel

      mode="login"

      settings={settings}

      experience={experience}

      registerHref={`${path("register")}?next=${encodeURIComponent(nextForRegister)}`}

      loginHref={path("login")}

      onSubmit={login}

      submitLabel={loading ? "جاري الدخول..." : "دخول ومتابعة"}

    >

      <ThemedInput

        experience={experience}

        value={email}

        onChange={(e) => setEmail(e.target.value)}

        placeholder="البريد الإلكتروني"

        type="email"

      />

      <ThemedInput

        experience={experience}

        value={password}

        onChange={(e) => setPassword(e.target.value)}

        placeholder="كلمة المرور"

        type="password"

      />

      <button
        type="button"
        onClick={() => {
          setResetEmail(email);
          setResetMessage("");
          setResetOpen((value) => !value);
        }}
        className="text-sm font-black text-[var(--ci-primary-bg,var(--barndaksa-brand-brown))] underline"
      >
        نسيت كلمة المرور؟
      </button>

      {resetOpen ? (
        <div className="rounded-2xl border border-black/10 bg-white/70 p-4">
          <p className="text-sm font-black">استعادة كلمة المرور</p>
          <ThemedInput
            experience={experience}
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            placeholder="البريد الإلكتروني"
            type="email"
            className="mt-3"
          />
          {resetMessage ? (
            <p className="mt-3 text-sm font-bold">{resetMessage}</p>
          ) : null}
          <button
            type="button"
            onClick={submitReset}
            disabled={resetLoading}
            className="mt-4 w-full rounded-2xl bg-[var(--ci-button-bg,var(--barndaksa-brand-brown))] px-5 py-3 font-black text-[var(--ci-button-fg,#fff)] disabled:opacity-60"
          >
            {resetLoading ? "جار إرسال الرابط..." : "إرسال رابط الاستعادة"}
          </button>
        </div>
      ) : null}

    </ThemedAuthPanel>

  );

}



export default function CafeCustomerLoginPage() {

  const params = useParams<{ slug: string }>();

  return (

    <CafeLayout slug={params.slug} className="py-8" maxWidth="max-w-5xl">

      <Suspense fallback={<p className="text-center font-black">جاري التحميل...</p>}>

        <LoginForm />

      </Suspense>

    </CafeLayout>

  );

}
