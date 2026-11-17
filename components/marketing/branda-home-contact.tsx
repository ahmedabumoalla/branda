"use client";
import { useRef, useState, type FormEvent } from "react";
import { MessageCircle } from "lucide-react";
import { submitHomeContactAction } from "@/app/actions/contact-requests";
import s from "./branda-home.module.css";
type Translate = (ar: string, en: string) => string;
export function HomeContactForm({ t, whatsapp, selectedPlan }: { t: Translate; whatsapp: string; selectedPlan: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false), requestId = useRef<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (sending.current) return; const form = event.currentTarget; const data = new FormData(form);
    const phone = String(data.get("phone") ?? "").replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632)).replace(/[\s()+-]/g, "");
    if (!/^(?:05\d{8}|9665\d{8}|009665\d{8})$/.test(phone)) { setMessage(t("أدخل رقم جوال سعودي صحيحًا", "Enter a valid Saudi mobile number")); form.querySelector<HTMLInputElement>('[name="phone"]')?.focus(); return; }
    sending.current = true; setBusy(true); setMessage("");
    requestId.current ??= crypto.randomUUID();
    try {
      const result = await submitHomeContactAction({ requestId: requestId.current, fullName: String(data.get("fullName") ?? ""), phone, business: String(data.get("business") ?? ""), businessType: String(data.get("type") ?? ""), selectedPlan, website: String(data.get("website") ?? "") });
      if (!result.ok) {
        setMessage(result.reason === "invalid" ? t("راجع بيانات الطلب ورقم الجوال", "Check your details and mobile number") : result.reason === "rate" ? t("تم استلام طلباتك السابقة حاول لاحقًا", "Your previous requests were received, please try later") : t("تعذر إرسال الطلب حاول مجددًا", "Could not send your request, please try again"));
      } else { setMessage(t("تم إرسال طلبك لفريق برندة وبنتواصل معك قريبًا", "Your request was sent to Branda and we will contact you soon")); form.reset(); requestId.current = null; }
    } catch { setMessage(t("تعذر الاتصال حاول مجددًا وبياناتك محفوظة في النموذج", "Connection failed, please retry — your details remain in the form")); }
    finally { sending.current = false; setBusy(false); }
  }
  return <form className={s.contactForm} onSubmit={submit} aria-busy={busy}><div className={s.honeypot} aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div><h3>{t("تواصل معنا", "Contact us")}</h3><p>{t("اترك بياناتك ليتواصل معك فريق برنده", "Leave your details and the Branda team will get in touch")}</p>{selectedPlan && <p className={s.selectedPlan}>{t("الباقة المختارة:", "Selected plan:")} {selectedPlan}</p>}<label>{t("الاسم", "Name")}<input name="fullName" autoComplete="name" required minLength={2} maxLength={120} placeholder={t("محمد", "Your name")} /></label><label>{t("رقم الجوال", "Mobile number")}<input name="phone" autoComplete="tel" type="tel" inputMode="tel" dir="ltr" required maxLength={24} placeholder="05XXXXXXXX" /></label><div className={s.formPair}><label>{t("اسم النشاط", "Business name")}<input name="business" autoComplete="organization" required minLength={2} maxLength={150} placeholder={t("أشجار كافيه", "Your business")} /></label><label>{t("نوعه", "Business type")}<select name="type" required defaultValue=""><option value="" disabled>{t("اختر النوع", "Choose type")}</option>{[["مطعم", "Restaurant"], ["ملحمة", "Butcher shop"], ["مقهى", "Café"], ["فود ترك / عربة قهوة", "Food truck / coffee cart"], ["مخبز وحلويات", "Bakery and sweets"], ["متجر تجزئة", "Retail store"], ["سوبرماركت / تموينات", "Supermarket / groceries"], ["عطور وتجميل", "Perfumes and beauty"], ["صالون / مركز عناية", "Salon / care centre"], ["صيدلية", "Pharmacy"], ["نشاط متعدد الفروع", "Multi-branch business"], ["أخرى", "Other"]].map(([ar, en]) => <option key={en} value={ar}>{t(ar, en)}</option>)}</select></label></div><button className={s.primary} type="submit" disabled={busy}>{busy ? t("جارٍ إرسال الطلب", "Sending request") : t("أرسل الطلب", "Send request")}</button>{message && <p role="status" className={s.formMessage}>{message}</p>}<div className={s.or}><span>{t("أو", "or")}</span></div><a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className={s.whatsappLink}><MessageCircle size={18} aria-hidden="true" />{t("اطلب عرض عبر واتساب", "Request a quote on WhatsApp")}</a></form>;
}

