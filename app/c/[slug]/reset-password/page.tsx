"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { resetCustomerPasswordAction } from "@/app/actions/auth";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import { ThemedInput } from "@/components/cafe/themes/themed-auth-panel";
import { appendPreviewToNextPath } from "@/lib/cafe/theme-links";

function CustomerResetPasswordForm() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = params.slug;
  const token = searchParams.get("token") ?? "";
  const { experience, path, previewThemeId } = useCafePageContext(slug);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!token) {
      setMessage("رابط استعادة كلمة المرور غير صالح أو منتهي. اطلب رابطًا جديدًا.");
      return;
    }

    if (password.length < 8) {
      setMessage("كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("تأكيد كلمة المرور يجب أن يطابق كلمة المرور الجديدة.");
      return;
    }

    setSaving(true);
    const result = await resetCustomerPasswordAction({
      cafeSlug: slug,
      token,
      newPassword: password,
      confirmPassword,
    });
    setSaving(false);
    setMessage(result.message);

    if (result.ok) {
      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl rounded-[32px] border border-black/5 bg-white p-6 shadow-[0_22px_70px_rgba(49,25,18,0.12)]">
      <h1 className="text-2xl font-black text-[var(--ci-page-fg,#311912)]">
        تعيين كلمة مرور جديدة
      </h1>
      <p className="mt-2 text-sm font-bold text-[var(--ci-muted-fg,#806A5E)]">
        أدخل كلمة المرور الجديدة لحسابك داخل هذه العلامة.
      </p>

      {!token || success ? (
        <div className="mt-6 space-y-4">
          {message ? (
            <p className={success ? "font-black text-emerald-700" : "font-black text-red-600"}>
              {message}
            </p>
          ) : (
            <p className="font-black text-red-600">
              رابط استعادة كلمة المرور غير صالح أو منتهي. اطلب رابطًا جديدًا.
            </p>
          )}
          <Link
            href={appendPreviewToNextPath(path("login"), previewThemeId)}
            className="inline-flex w-full items-center justify-center rounded-2xl bg-[var(--ci-button-bg,var(--barndaksa-brand-brown))] px-5 py-4 font-black text-[var(--ci-button-fg,#fff)]"
          >
            العودة إلى تسجيل الدخول
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <PasswordInput
            experience={experience}
            label="كلمة المرور الجديدة"
            value={password}
            visible={passwordVisible}
            onChange={setPassword}
            onToggle={() => setPasswordVisible((value) => !value)}
          />
          <PasswordInput
            experience={experience}
            label="تأكيد كلمة المرور الجديدة"
            value={confirmPassword}
            visible={confirmVisible}
            onChange={setConfirmPassword}
            onToggle={() => setConfirmVisible((value) => !value)}
          />
          {message ? <p className="font-black text-red-600">{message}</p> : null}
          <button
            type="submit"
            disabled={saving || success}
            className="w-full rounded-2xl bg-[var(--ci-button-bg,var(--barndaksa-brand-brown))] px-5 py-4 font-black text-[var(--ci-button-fg,#fff)] disabled:opacity-60"
          >
            {saving ? "جار حفظ كلمة المرور..." : "حفظ كلمة المرور"}
          </button>
        </form>
      )}
    </div>
  );
}

function PasswordInput({
  experience,
  label,
  value,
  visible,
  onChange,
  onToggle,
}: {
  experience: ReturnType<typeof useCafePageContext>["experience"];
  label: string;
  value: string;
  visible: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">
        {label}
      </span>
      <div className="relative mt-2">
        <ThemedInput
          experience={experience}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          minLength={8}
          required
          autoComplete="new-password"
          placeholder="••••••••"
          className="pl-12"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute left-4 top-1/2 -translate-y-1/2"
          aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        >
          {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </label>
  );
}

export default function CustomerResetPasswordPage() {
  const params = useParams<{ slug: string }>();
  return (
    <CafeLayout slug={params.slug} className="py-8" maxWidth="max-w-3xl">
      <Suspense fallback={<p className="text-center font-black">جاري التحميل...</p>}>
        <CustomerResetPasswordForm />
      </Suspense>
    </CafeLayout>
  );
}
