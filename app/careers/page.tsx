"use client";

import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, FileText } from "lucide-react";
import { useState, type FormEvent } from "react";
import { submitJobApplicationAction } from "@/app/actions/jobs";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";

export default function CareersPage() {
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus(null);

    const form = event.currentTarget;
    const result = await submitJobApplicationAction(new FormData(form));

    setSaving(false);
    setStatus(result);

    if (result.ok) {
      form.reset();
    }
  }

  const fieldClass =
    "h-14 w-full rounded-2xl border border-[#E7D7C6] bg-white px-4 text-right font-bold text-[#311912] outline-none focus:border-[#D9A33F]";
  const textAreaClass =
    "min-h-32 w-full rounded-2xl border border-[#E7D7C6] bg-white p-4 text-right font-bold text-[#311912] outline-none focus:border-[#D9A33F]";

  return (
    <main dir="rtl" className="min-h-screen bg-[#FCF8F3] text-[#311912]">
      <header className="border-b border-[#E7D7C6] bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <Link href="/">
            <BarndaksaLogo variant="brown" width={145} height={56} priority />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-2xl border border-[#E7D7C6] px-4 py-3 font-black text-[#6B3A25]"
          >
            <ArrowRight className="h-4 w-4" />
            العودة للرئيسية
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-[32px] bg-gradient-to-br from-[#4A281D] to-[#311912] p-7 text-[#FCF8F3]">
          <BriefcaseBusiness className="h-12 w-12 text-[#F6C35B]" />
          <h1 className="mt-6 text-3xl font-black">انضم إلى فريق بارنداكسا</h1>
          <p className="mt-4 font-bold leading-8 text-[#E8D7C7]">
            نبحث عن المواهب الطموحة للمشاركة في تطوير تجربة رقمية متقدمة
            للعلامات التجارية
          </p>
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
            <FileText className="h-6 w-6 text-[#F6C35B]" />
            <p className="mt-3 font-black">أرفق سيرتك الذاتية بصيغة PDF</p>
            <p className="mt-2 text-sm font-bold text-[#CBB29C]">
              الحد الأقصى لحجم الملف 8MB
            </p>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="rounded-[32px] border border-[#E7D7C6] bg-white p-5 shadow-sm sm:p-7"
        >
          <h2 className="mb-6 text-2xl font-black">طلب توظيف جديد</h2>

          {status ? (
            <p
              className={`mb-5 rounded-2xl border p-4 text-center font-black ${
                status.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {status.message}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <input required name="fullName" placeholder="الاسم كامل" className={fieldClass} />
            <input required name="birthDate" type="date" className={fieldClass} />

            <select required name="gender" className={fieldClass} defaultValue="">
              <option value="" disabled>
                الجنس
              </option>
              <option value="male">ذكر</option>
              <option value="female">أنثى</option>
            </select>

            <input required name="region" placeholder="المنطقة" className={fieldClass} />
            <input required name="phone" placeholder="رقم الجوال" className={fieldClass} />
            <input required name="email" type="email" placeholder="البريد الإلكتروني" className={fieldClass} />
            <input required name="languages" placeholder="اللغات" className={`${fieldClass} sm:col-span-2`} />
            <textarea name="experience" placeholder="الخبرات السابقة" className={`${textAreaClass} sm:col-span-2`} />

            <label className="sm:col-span-2">
              <span className="mb-2 block text-sm font-black text-[#6B3A25]">
                السيرة الذاتية PDF
              </span>
              <input
                required
                name="cv"
                type="file"
                accept="application/pdf"
                className={`${fieldClass} py-3`}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-7 flex h-14 w-full items-center justify-center rounded-2xl bg-[#4A281D] font-black text-white disabled:opacity-60"
          >
            {saving ? "جاري إرسال الطلب" : "إرسال طلب التوظيف"}
          </button>
        </form>
      </section>
    </main>
  );
}
