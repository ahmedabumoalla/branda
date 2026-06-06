"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Eye, EyeOff, MapPin, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";
import { registerCafeOwnerAction } from "@/app/actions/auth";
import { GoogleMapPicker } from "@/components/maps/google-map-picker";
import { BrandaLogo } from "@/components/ui/branda-logo";
import { LOGO } from "@/lib/ui/brand";
import { BRAND_COLORS as C } from "@/lib/ui/brand-colors";

type BrandCategory = {
  id: string;
  label: string;
  available: boolean;
};

const BRAND_CATEGORIES: BrandCategory[] = [
  { id: "cafes_coffee", label: "مقاهي وكوفيهات", available: true },
  { id: "restaurants", label: "مطاعم", available: false },
  { id: "massage_centers", label: "مراكز مساج", available: false },
  { id: "beauty_centers", label: "مراكز تجميل", available: false },
  { id: "hair_salons", label: "صالونات العناية بالشعر", available: false },
  { id: "clinics_health_centers", label: "العيادات والمراكز الصحية", available: false },
  { id: "gyms_fitness", label: "صالات الرياضة واللياقة البدنية", available: false },
  { id: "retail_stores", label: "متاجر البيع بالتجزئة", available: false },
  { id: "clothing_stores", label: "متاجر الملابس", available: false },
  { id: "furniture", label: "المفروشات", available: false },
  { id: "events_conferences", label: "الفعاليات والمؤتمرات", available: false },
];

type SelectedLocation = { lat: number; lng: number };

export default function RegisterPage() {
  const router = useRouter();
  const [ownerName, setOwnerName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [brandCategory, setBrandCategory] = useState("cafes_coffee");
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

  const handleMapChange = useCallback((location: SelectedLocation) => {
    setSelectedLocation(location);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (email.trim().toLowerCase() !== emailConfirm.trim().toLowerCase()) {
      setMessage("البريد الإلكتروني غير متطابق");
      return;
    }

    if (password !== passwordConfirm) {
      setMessage("كلمة المرور غير متطابقة");
      return;
    }

    if (brandCategory !== "cafes_coffee") {
      setMessage("هذا التصنيف قريبًا");
      return;
    }

    if (!selectedLocation) {
      setMessage("حدد موقع الفرع الأساسي على الخريطة");
      return;
    }

    setSubmitting(true);
    setMessage("");

    const result = await registerCafeOwnerAction({
      ownerName,
      brandName,
      brandCategory,
      slug,
      email,
      phone,
      password,
      primaryBranchName,
      primaryBranchAddress,
      primaryBranchCity,
      primaryBranchLat: selectedLocation.lat,
      primaryBranchLng: selectedLocation.lng,
      couponCode,
    });

    setSubmitting(false);
    setMessage(result.message);

    if (result.ok && result.redirectTo) router.push(result.redirectTo);
  }

  const fieldClass =
    "branda-neumo-inset h-14 w-full rounded-2xl border px-5 text-right font-bold outline-none";

  return (
    <main
      dir="rtl"
      className="grid min-h-screen lg:grid-cols-2"
      style={{ background: C.creamBase, color: C.espressoDark }}
    >
      <section
        className="relative hidden flex-col items-center justify-center overflow-hidden px-12 lg:flex"
        style={{ background: `linear-gradient(to bottom right, ${C.warmSand}, ${C.creamBase})` }}
      >
        <Image
          src={LOGO.brownBg}
          alt=""
          width={280}
          height={280}
          className="pointer-events-none absolute h-auto opacity-15 object-contain"
        />
        <BrandaLogo variant="brown" width={220} height={88} priority className="relative" />
        <h1 className="relative mt-10 text-center text-4xl font-black leading-tight" style={{ color: C.coffeeBrown }}>
          ابدأ علامتك الرقمية مع برندة
        </h1>
        <p className="relative mt-4 text-center text-lg font-bold" style={{ color: C.mutedText }}>
          تنطلق علامتك على الباقة الأساسية فور التسجيل
        </p>
      </section>

      <section className="flex min-w-0 items-start justify-center bg-white px-4 py-8 sm:px-6 sm:py-10">
        <div className="w-full max-w-[680px]">
          <div className="mb-7 flex flex-col items-center text-center">
            <BrandaLogo variant="brown" width={180} height={72} />
            <h1 className="mt-5 text-3xl font-black" style={{ color: C.coffeeBrown }}>
              إنشاء حساب علامة تجارية
            </h1>
          </div>

          <div className="mb-6 grid grid-cols-2 overflow-hidden rounded-2xl border" style={{ borderColor: C.borderSand }}>
            <Link href="/login" className="bg-white py-4 text-center font-black" style={{ color: C.mutedText }}>
              تسجيل الدخول
            </Link>
            <span className="py-4 text-center font-black" style={{ background: C.coffeeBrown, color: C.creamBase }}>
              إنشاء حساب
            </span>
          </div>

          {message ? (
            <div className="mb-5 rounded-2xl border border-[#D9A33F]/30 bg-[#FCF8F3] p-4 text-center font-black text-[#6B3A25]">
              {message}
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={submit}>
            <input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="اسم المستخدم" required className={fieldClass} style={{ borderColor: C.borderSand, background: C.creamBase }} />
            <input value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="اسم العلامة التجارية" required className={fieldClass} style={{ borderColor: C.borderSand, background: C.creamBase }} />

            <label className="relative block">
              <Store className="pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6B3A25]" />
              <select
                value={brandCategory}
                onChange={(event) => setBrandCategory(event.target.value)}
                required
                className={`${fieldClass} appearance-none pr-14`}
                style={{ borderColor: C.borderSand, background: C.creamBase }}
              >
                {BRAND_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id} disabled={!category.available}>
                    {category.label}{category.available ? "" : "  قريبًا"}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6B3A25]" />
            </label>

            <input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/\s+/g, "-"))} placeholder="الرابط المختصر بالإنجليزي مثل my-brand" dir="ltr" required className={`${fieldClass} text-left`} style={{ borderColor: C.borderSand, background: C.creamBase }} />
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="البريد الإلكتروني" required className={fieldClass} style={{ borderColor: C.borderSand, background: C.creamBase }} />
            <input type="email" value={emailConfirm} onChange={(event) => setEmailConfirm(event.target.value)} placeholder="تأكيد البريد الإلكتروني" required className={fieldClass} style={{ borderColor: C.borderSand, background: C.creamBase }} />
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="رقم الجوال" required className={fieldClass} style={{ borderColor: C.borderSand, background: C.creamBase }} />

            <section className="rounded-[26px] border border-[#E7D7C6] bg-[#FCF8F3] p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2 text-[#6B3A25]">
                <MapPin className="h-5 w-5" />
                <h2 className="font-black">موقع الفرع الأساسي</h2>
              </div>
              <p className="mb-4 text-sm font-bold text-[#806A5E]">
                مطلوب لجميع العلامات التجارية بما فيها العلامات السحابية
              </p>
              <div className="space-y-4">
                <input value={primaryBranchName} onChange={(event) => setPrimaryBranchName(event.target.value)} placeholder="اسم الفرع الأساسي" required className={fieldClass} style={{ borderColor: C.borderSand, background: "#ffffff" }} />
                <input value={primaryBranchAddress} onChange={(event) => setPrimaryBranchAddress(event.target.value)} placeholder="العنوان التفصيلي للفرع أو المكتب" required className={fieldClass} style={{ borderColor: C.borderSand, background: "#ffffff" }} />
                <input value={primaryBranchCity} onChange={(event) => setPrimaryBranchCity(event.target.value)} placeholder="المدينة" required className={fieldClass} style={{ borderColor: C.borderSand, background: "#ffffff" }} />
                <GoogleMapPicker value={selectedLocation} onChange={handleMapChange} />
              </div>
            </section>

            <PasswordField value={password} setValue={setPassword} placeholder="كلمة المرور" visible={showPassword} toggle={() => setShowPassword(!showPassword)} />
            <PasswordField value={passwordConfirm} setValue={setPasswordConfirm} placeholder="تأكيد كلمة المرور" visible={showPasswordConfirm} toggle={() => setShowPasswordConfirm(!showPasswordConfirm)} />
            <input value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} placeholder="كوبون الخصم اختياري" className={fieldClass} style={{ borderColor: C.borderSand, background: C.creamBase }} />

            <button type="submit" disabled={submitting} className="flex h-16 w-full items-center justify-center rounded-2xl text-lg font-black disabled:opacity-60" style={{ background: C.coffeeBrown, color: C.creamBase }}>
              {submitting ? "جاري إنشاء الحساب" : "تسجيل العلامة التجارية"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function PasswordField({
  value,
  setValue,
  placeholder,
  visible,
  toggle,
}: {
  value: string;
  setValue: (value: string) => void;
  placeholder: string;
  visible: boolean;
  toggle: () => void;
}) {
  return (
    <div className="relative">
      <input type={visible ? "text" : "password"} minLength={8} value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} required className="branda-neumo-inset h-14 w-full rounded-2xl border border-[#E7D7C6] bg-[#FCF8F3] px-5 pl-14 text-right font-bold outline-none" />
      <button type="button" onClick={toggle} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B3A25]">
        {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
}
