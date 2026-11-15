import { redirect } from "next/navigation";
import { loginCashierWithPassword } from "@/lib/data/cashier";
import { ScannerLogin } from "@/components/loyalty/scanner-login";

async function login(_state: { message: string }, form: FormData) {
  "use server";
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (email.length > 254 || password.length > 200 || !email || !password) return { message: "أدخل بيانات الموظف الصحيحة." };
  try {
    if (!await loginCashierWithPassword(email, password)) return { message: "بيانات الدخول غير صحيحة أو الحساب غير فعّال." };
  } catch { return { message: "تعذر تسجيل الدخول، حاول لاحقًا." }; }
  redirect("/loyalty/scan");
}

export default function LoyaltyScannerLoginPage() { return <ScannerLogin action={login} />; }
