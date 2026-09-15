"use client";

import { Headphones, Link as LinkIcon, Send, ShieldCheck, Trophy } from "lucide-react";
import { useState } from "react";
import { createPublicSupportTicketAction } from "@/app/actions/final-product-release";
import { submitCustomerExperienceRewardProofAction } from "@/app/actions/experience-rewards";

export function PublicExperienceSupportSection({ slug, cafeName }: { slug: string; cafeName: string }) {
  const [supportMessage, setSupportMessage] = useState("");
  const [experienceMessage, setExperienceMessage] = useState("");

  async function submitSupport(formData: FormData) {
    const result = await createPublicSupportTicketAction({
      slug,
      name: String(formData.get("name") || ""),
      phone: String(formData.get("phone") || ""),
      message: String(formData.get("message") || ""),
    });
    setSupportMessage(result.message);
  }

  async function submitExperience(formData: FormData) {
    if (formData.get("agreed") !== "on") {
      setExperienceMessage("يجب الموافقة على الشروط قبل الإرسال");
      return;
    }

    try {
      await submitCustomerExperienceRewardProofAction({
        cafeSlug: slug,
        experienceUrl: String(formData.get("url") || "").trim(),
        currentViews: 0,
        currentComments: 0,
        customerNotes: [
          String(formData.get("customerName") || "").trim(),
          String(formData.get("contact") || "").trim(),
        ].filter(Boolean).join(" - ") || undefined,
      });
      setExperienceMessage(`تم إرسال التوثيق إلى ${cafeName} للمراجعة`);
    } catch {
      setExperienceMessage("سجل دخولك كعميل لهذه العلامة ثم أعد إرسال رابط التوثيق");
    }
  }

  return (
    <section dir="rtl" className="mt-6 grid gap-5">
      <div id="document-experience" className="rounded-[32px] border border-[#E7D7C6] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <Trophy className="h-7 w-7 text-[#D9A33F]" />
          <div>
            <p className="font-black text-[#6B3A25]">وثق تجربتك</p>
            <h2 className="text-xl font-black text-[#311912]">صوّر تجربتك وخذ مكافأتك</h2>
          </div>
        </div>
        <p className="mt-3 text-sm font-bold leading-7 text-[#806A5E]">
          انشر تجربتك مع {cafeName} ثم أرسل الرابط وتتم المراجعة خلال سبعة أيام عمل
        </p>

        <form action={submitExperience} className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-2 block text-sm font-black text-[#6B3A25]">اسم العميل</span>
            <input name="customerName" className="w-full rounded-2xl border p-4 font-bold outline-none" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-black text-[#6B3A25]">رقم الجوال أو البريد</span>
            <input name="contact" className="w-full rounded-2xl border p-4 font-bold outline-none" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-black text-[#6B3A25]">رابط التوثيق</span>
            <input name="url" className="w-full rounded-2xl border p-4 font-bold outline-none" />
          </label>
          <label className="flex items-start gap-2 text-xs font-bold leading-6 text-[#806A5E]">
            <input name="agreed" type="checkbox" required className="mt-1" />
            أوافق على الشروط والأحكام ومراجعة الرابط قبل صرف المكافأة
          </label>
          <button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6B3A25] px-5 py-3 font-black text-white">
            <LinkIcon className="h-4 w-4" />
            إرسال التوثيق
          </button>
          {experienceMessage ? <p className="font-bold text-[#6B3A25]">{experienceMessage}</p> : null}
        </form>
      </div>

      <div id="support" className="rounded-[32px] border border-[#E7D7C6] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <Headphones className="h-7 w-7 text-[#D9A33F]" />
          <div>
            <p className="font-black text-[#6B3A25]">الدعم</p>
            <h2 className="text-xl font-black text-[#311912]">دعم متاح 24 ساعة</h2>
          </div>
        </div>
        <p className="mt-3 text-sm font-bold leading-7 text-[#806A5E]">
          أرسل المشكلة وسيظهر الطلب في لوحة الأدمن مع رقم العلامة الفريد
        </p>

        <form action={submitSupport} className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-2 block text-sm font-black text-[#6B3A25]">الاسم</span>
            <input name="name" className="w-full rounded-2xl border p-4 font-bold outline-none" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-black text-[#6B3A25]">رقم الجوال</span>
            <input name="phone" className="w-full rounded-2xl border p-4 font-bold outline-none" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-black text-[#6B3A25]">وصف المشكلة</span>
            <textarea name="message" rows={4} className="w-full rounded-2xl border p-4 font-bold outline-none" />
          </label>
          <button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#311912] px-5 py-3 font-black text-white">
            <Send className="h-4 w-4" />
            إرسال طلب الدعم
          </button>
          {supportMessage ? <p className="font-bold text-[#6B3A25]">{supportMessage}</p> : null}
        </form>

        <div className="mt-5 flex items-center gap-2 rounded-2xl bg-[#FCF8F3] p-4 text-xs font-bold leading-6 text-[#6B3A25]">
          <ShieldCheck className="h-5 w-5" />
          يتم حفظ الطلب وربطه بالعلامة التجارية داخل لوحة الإدارة
        </div>
      </div>
    </section>
  );
}
