"use client";

import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  confirmPasswordRecoverySessionAction,
  getPasswordRecoveryStateAction,
  updatePasswordAction,
} from "@/app/actions/auth";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { NeumoInput, PrimaryButton, SoftCard } from "@/components/ui/design-system";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(true);
  const [validRecovery, setValidRecovery] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkRecovery() {
      if (typeof window !== "undefined" && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (accessToken && refreshToken) {
          const supabase = createClient();
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          window.history.replaceState(null, "", window.location.pathname);

          if (!error) {
            await confirmPasswordRecoverySessionAction();
          }
        }
      }

      return getPasswordRecoveryStateAction();
    }

    checkRecovery()
      .then((result) => {
        if (!mounted) return;
        setValidRecovery(result.ok);
        if (!result.ok) {
          setMessage("رابط استعادة كلمة المرور غير صالح أو منتهي. اطلب رابطًا جديدًا.");
        }
      })
      .catch(() => {
        if (!mounted) return;
        setValidRecovery(false);
        setMessage("رابط استعادة كلمة المرور غير صالح أو منتهي. اطلب رابطًا جديدًا.");
      })
      .finally(() => {
        if (mounted) setChecking(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    if (password.length < 8) {
      setMessage("كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.");
      return;
    }

    if (password !== confirm) {
      setMessage("تأكيد كلمة المرور يجب أن يطابق كلمة المرور الجديدة.");
      return;
    }

    setSaving(true);
    const result = await updatePasswordAction(password, confirm);
    setSaving(false);
    setMessage(result.message);

    if (result.ok) {
      setSuccess(true);
      setPassword("");
      setConfirm("");
    }
  }

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#FCF8F3] p-4">
      <SoftCard className="w-full max-w-md p-8">
        <BarndaksaLogo variant="brown" width={150} height={60} />
        <h1 className="mt-6 text-2xl font-black text-[#311912]">تعيين كلمة مرور جديدة</h1>

        {checking ? (
          <p className="mt-6 font-black text-[#6B3A25]">جار التحقق من رابط الاستعادة...</p>
        ) : null}

        {!checking && (!validRecovery || success) ? (
          <div className="mt-6 space-y-5">
            {message ? (
              <p className={success ? "font-black text-emerald-700" : "font-black text-red-600"}>
                {message}
              </p>
            ) : null}
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-2xl bg-[#4A281D] px-6 py-4 font-black text-[#FCF8F3] transition hover:bg-[#311912]"
            >
              العودة إلى تسجيل الدخول
            </Link>
          </div>
        ) : null}

        {!checking && validRecovery && !success ? (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <PasswordField
              label="كلمة المرور الجديدة"
              value={password}
              visible={passwordVisible}
              onChange={setPassword}
              onToggle={() => setPasswordVisible((value) => !value)}
            />
            <PasswordField
              label="تأكيد كلمة المرور الجديدة"
              value={confirm}
              visible={confirmVisible}
              onChange={setConfirm}
              onToggle={() => setConfirmVisible((value) => !value)}
            />
            {message ? <p className="font-black text-red-600">{message}</p> : null}
            <PrimaryButton disabled={saving} className="w-full">
              {saving ? "جار تحديث كلمة المرور..." : "تحديث كلمة المرور"}
            </PrimaryButton>
          </form>
        ) : null}
      </SoftCard>
    </main>
  );
}

function PasswordField({
  label,
  value,
  visible,
  onChange,
  onToggle,
}: {
  label: string;
  value: string;
  visible: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[#7A6255]">{label}</span>
      <div className="relative mt-2">
        <NeumoInput
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="••••••••"
          required
          minLength={8}
          className="pl-12"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B3A25]"
          aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        >
          {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </label>
  );
}
