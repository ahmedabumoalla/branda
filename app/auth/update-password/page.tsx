"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { updatePasswordAction } from "@/app/actions/auth";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { NeumoInput, PrimaryButton, SoftCard } from "@/components/ui/design-system";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setMessage("كلمة المرور غير متطابقة");
      return;
    }
    try {
      await updatePasswordAction(password);
      router.push("/login");
    } catch {
      setMessage("تعذر تحديث كلمة المرور");
    }
  }

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#FCF8F3] p-4">
      <SoftCard className="w-full max-w-md p-8">
        <BarndaksaLogo variant="brown" width={150} height={60} />
        <h1 className="mt-6 text-2xl font-black">تعيين كلمة مرور جديدة</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="relative">
            <NeumoInput type={visible ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="كلمة المرور الجديدة" required minLength={8} className="pl-12" />
            <button type="button" onClick={() => setVisible(!visible)} className="absolute left-4 top-1/2 -translate-y-1/2">{visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
          </div>
          <NeumoInput type={visible ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="تأكيد كلمة المرور" required minLength={8} />
          {message ? <p className="font-black text-red-600">{message}</p> : null}
          <PrimaryButton className="w-full">حفظ كلمة المرور</PrimaryButton>
        </form>
      </SoftCard>
    </main>
  );
}
