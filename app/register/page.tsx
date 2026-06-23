"use client";

import Link from "next/link";
import { Eye, EyeOff, MapPin, Store, Coffee, Utensils, Dumbbell, Scissors, Stethoscope, Shirt, Sofa, Sparkles, Building2, Flower2, ShoppingBag, Bath, PartyPopper } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent, type ReactNode, type ElementType } from "react";
import { registerCafeOwnerAction } from "@/app/actions/auth";
import { GoogleMapPicker } from "@/components/maps/google-map-picker";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import type { BusinessCategoryId } from "@/lib/platform/business-categories";
import { BRAND_COLORS as C } from "@/lib/ui/brand-colors";

type BrandCategory = { id: BusinessCategoryId; label: string; available: boolean; icon: ElementType };

const BRAND_CATEGORIES: BrandCategory[] = [
  { id: "cafes_coffee", label: "مقاهي وكوفيهات", available: true, icon: Coffee },
  { id: "restaurants", label: "مطاعم", available: true, icon: Utensils },
  { id: "massage_centers", label: "مراكز مساج", available: false, icon: Bath },
  { id: "beauty_centers", label: "مراكز تجميل", available: false, icon: Flower2 },
  { id: "hair_salons", label: "صالونات العناية بالشعر", available: false, icon: Scissors },
  { id: "clinics_health_centers", label: "العيادات والمراكز الصحية", available: false, icon: Stethoscope },
  { id: "gyms_fitness", label: "صالات الرياضة واللياقة", available: false, icon: Dumbbell },
  { id: "retail_stores", label: "متاجر البيع بالتجزئة", available: false, icon: ShoppingBag },
  { id: "clothing_stores", label: "متاجر الملابس", available: false, icon: Shirt },
  { id: "furniture", label: "المفروشات", available: false, icon: Sofa },
  { id: "events_conferences", label: "الفعاليات والمؤتمرات", available: false, icon: PartyPopper },
];

type SelectedLocation = { lat: number; lng: number };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-black text-[#6B3A25]">{label}</span>{children}</label>;
}

export default function RegisterPage() {
  const router = useRouter();
  const [ownerName, setOwnerName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [brandCategory, setBrandCategory] = useState<BusinessCategoryId>("cafes_coffee");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [phone, setPhone] = useState("");
  const [primaryBranchName, setPrimaryBranchName] = useState("الفرع الأساسي");
  const [primaryBranchAddress, setPrimaryBranchAddress] = useState("");
  const [primaryBranchCity, setPrimaryBranchCity] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const handleMapChange = useCallback((location: SelectedLocation) => setSelectedLocation(location), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim().toLowerCase() !== emailConfirm.trim().toLowerCase()) return setMessage("البريد الإلكتروني غير متطابق");
    if (password !== passwordConfirm) return setMessage("كلمة المرور غير متطابقة");
    if (brandCategory !== "cafes_coffee" && brandCategory !== "restaurants") return setMessage("هذا التصنيف قريبًا");
    if (!selectedLocation) return setMessage("حدد موقع الفرع الأساسي على الخريطة");
    setSubmitting(true); setMessage("");
    const result = await registerCafeOwnerAction({ ownerName, brandName, brandCategory, slug, email, phone, password, primaryBranchName, primaryBranchAddress, primaryBranchCity, primaryBranchLat: selectedLocation.lat, primaryBranchLng: selectedLocation.lng, primaryBranchRadiusMeters: 50, couponCode });
    setSubmitting(false); setMessage(result.message);
    if (result.ok && result.redirectTo) router.push(result.redirectTo);
  }

  const fieldClass = "barndaksa-neumo-inset h-14 w-full rounded-2xl border px-5 text-right font-bold outline-none";

  return (
    <main dir="rtl" className="grid min-h-screen lg:grid-cols-2" style={{ background: C.creamBase, color: C.espressoDark }}>
      <section className="relative hidden flex-col items-center justify-center overflow-hidden px-12 lg:flex" style={{ background: `linear-gradient(to bottom right, ${C.warmSand}, ${C.creamBase})` }}>
        <div className="max-w-xl text-center">
          <p className="text-sm font-black tracking-[0.3em] text-[#9B6A34]">برندة</p>
          <h1 className="mt-5 text-5xl font-black leading-tight" style={{ color: C.coffeeBrown }}>أهلاً بك في نافذة جديدة لنمو علامتك</h1>
          <p className="mt-5 text-lg font-bold leading-9" style={{ color: C.mutedText }}>أنشئ فرعك الإلكتروني وابدأ إدارة المنتجات والحجوزات والولاء والتسويق من مكان واحد</p>
        </div>
      </section>

      <section className="flex min-w-0 items-start justify-center bg-white px-4 py-8 sm:px-6 sm:py-10">
        <div className="w-full max-w-[760px]">
          <div className="mb-7 flex flex-col items-center text-center lg:hidden"><BarndaksaLogo variant="brown" width={180} height={72} /></div>
          <h1 className="text-center text-3xl font-black" style={{ color: C.coffeeBrown }}>إنشاء حساب علامة تجارية</h1>
          <p className="mt-2 text-center font-bold text-[#806A5E]">املأ البيانات التالية بدون أمثلة داخل الخانات</p>
          <div className="my-6 grid grid-cols-2 overflow-hidden rounded-2xl border" style={{ borderColor: C.borderSand }}><Link href="/login" className="bg-white py-4 text-center font-black" style={{ color: C.mutedText }}>تسجيل الدخول</Link><span className="py-4 text-center font-black" style={{ background: C.coffeeBrown, color: C.creamBase }}>إنشاء حساب</span></div>
          {message ? <div className="mb-5 rounded-2xl border border-[#D9A33F]/30 bg-[#FCF8F3] p-4 text-center font-black text-[#6B3A25]">{message}</div> : null}

          <form className="space-y-5" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="اسم المستخدم"><input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required className={fieldClass} style={{ borderColor: C.borderSand, background: C.creamBase }} /></Field>
              <Field label="اسم العلامة التجارية"><input value={brandName} onChange={(e) => setBrandName(e.target.value)} required className={fieldClass} style={{ borderColor: C.borderSand, background: C.creamBase }} /></Field>
            </div>

            <section className="rounded-[26px] border border-[#E7D7C6] bg-[#FCF8F3] p-4"><div className="mb-3 flex items-center gap-2 text-[#6B3A25]"><Store className="h-5 w-5" /><h2 className="font-black">تصنيف العلامة التجارية</h2></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{BRAND_CATEGORIES.map((category) => { const Icon = category.icon; const selected = brandCategory === category.id; return <button type="button" key={category.id} disabled={!category.available} onClick={() => category.available ? setBrandCategory(category.id) : setMessage("هذا التصنيف قريبًا")} className={`relative min-h-[112px] rounded-3xl border p-3 text-center transition ${selected ? "border-[#6B3A25] bg-white shadow-lg" : "border-[#E7D7C6] bg-white/70"} ${!category.available ? "opacity-60" : "hover:-translate-y-0.5"}`}><Icon className="mx-auto h-8 w-8 text-[#6B3A25]" /><span className="mt-2 block text-xs font-black text-[#3A2117]">{category.label}</span>{!category.available ? <span className="mt-2 inline-flex rounded-full bg-[#F5D58A] px-3 py-1 text-[10px] font-black text-[#6B3A25]">قريبًا</span> : null}</button>; })}</div></section>

            <Field label="اسم العلامة التجارية بالانجيزي"><input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))} dir="ltr" required className={`${fieldClass} text-left`} style={{ borderColor: C.borderSand, background: C.creamBase }} /></Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="البريد الإلكتروني"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={fieldClass} style={{ borderColor: C.borderSand, background: C.creamBase }} /></Field><Field label="تأكيد البريد الإلكتروني"><input type="email" value={emailConfirm} onChange={(e) => setEmailConfirm(e.target.value)} required className={fieldClass} style={{ borderColor: C.borderSand, background: C.creamBase }} /></Field></div>
            <Field label="رقم الجوال"><input value={phone} onChange={(e) => setPhone(e.target.value)} required className={fieldClass} style={{ borderColor: C.borderSand, background: C.creamBase }} /></Field>

            <section className="rounded-[26px] border border-[#E7D7C6] bg-[#FCF8F3] p-4 sm:p-5"><div className="mb-4 flex items-center gap-2 text-[#6B3A25]"><MapPin className="h-5 w-5" /><h2 className="font-black">موقع الفرع الأساسي</h2></div><p className="mb-4 text-sm font-bold text-[#806A5E]">يتم حفظ نقطة الموقع ونطاق 50 متر حولها للاستخدام داخل تجربة العلامة لاحقًا</p><div className="space-y-4"><Field label="اسم الفرع الأساسي"><input value={primaryBranchName} onChange={(e) => setPrimaryBranchName(e.target.value)} required className={fieldClass} style={{ borderColor: C.borderSand, background: "#ffffff" }} /></Field><Field label="العنوان التفصيلي للفرع أو المكتب"><input value={primaryBranchAddress} onChange={(e) => setPrimaryBranchAddress(e.target.value)} required className={fieldClass} style={{ borderColor: C.borderSand, background: "#ffffff" }} /></Field><Field label="المدينة"><input value={primaryBranchCity} onChange={(e) => setPrimaryBranchCity(e.target.value)} required className={fieldClass} style={{ borderColor: C.borderSand, background: "#ffffff" }} /></Field><GoogleMapPicker value={selectedLocation} onChange={handleMapChange} /></div></section>

            <PasswordField label="كلمة المرور" value={password} setValue={setPassword} visible={showPassword} toggle={() => setShowPassword(!showPassword)} />
            <PasswordField label="تأكيد كلمة المرور" value={passwordConfirm} setValue={setPasswordConfirm} visible={showPasswordConfirm} toggle={() => setShowPasswordConfirm(!showPasswordConfirm)} />
            <Field label="كوبون الخصم اختياري"><input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} className={fieldClass} style={{ borderColor: C.borderSand, background: C.creamBase }} /></Field>
            <button type="submit" disabled={submitting} className="flex h-16 w-full items-center justify-center rounded-2xl text-lg font-black disabled:opacity-60" style={{ background: C.coffeeBrown, color: C.creamBase }}>{submitting ? "جاري إنشاء الحساب" : "تسجيل العلامة التجارية"}</button>
          </form>
        </div>
      </section>
    </main>
  );
}

function PasswordField({ label, value, setValue, visible, toggle }: { label: string; value: string; setValue: (value: string) => void; visible: boolean; toggle: () => void }) {
  return <Field label={label}><div className="relative"><input type={visible ? "text" : "password"} minLength={8} value={value} onChange={(e) => setValue(e.target.value)} required className="barndaksa-neumo-inset h-14 w-full rounded-2xl border border-[#E7D7C6] bg-[#FCF8F3] px-5 pl-14 text-right font-bold outline-none" /><button type="button" onClick={toggle} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B3A25]">{visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></Field>;
}
