import Link from "next/link";

export default function RegisterPage() {
  return (
    <main dir="rtl" className="min-h-screen grid lg:grid-cols-2 bg-[#F8F4EF] text-[#2B1710]">
      <section className="hidden lg:flex flex-col items-center justify-center bg-[#EFE8DF] px-12">
        <h1 className="text-4xl font-black text-[#3A2117] text-center leading-tight">
          ابدأ كوفيك الرقمي مع برندة
        </h1>
        <p className="mt-4 text-[#7A6255] text-lg text-center">
          منيو، حجوزات، عروض، ونقاط ولاء في لوحة واحدة.
        </p>

        <div className="mt-12 w-[560px] rounded-[32px] bg-white p-7 shadow-2xl">
          <div className="rounded-[24px] bg-[#E4F5EF] p-8">
            <h2 className="font-black text-2xl text-[#143C35] mb-6">خطوات إطلاق الكوفي</h2>
            {["أضف بيانات الكوفي", "ارفع المنيو", "فعّل الحجوزات", "أنشئ برنامج الولاء"].map((x) => (
              <div key={x} className="mb-4 rounded-2xl bg-white/80 p-4 font-bold flex gap-3">
                <span className="w-7 h-7 rounded-full bg-[#5FBF9A] text-white flex items-center justify-center">✓</span>
                {x}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center bg-white px-6 py-10">
        <div className="w-full max-w-[620px]">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-black text-[#3A2117]">إنشاء حساب</h1>
            <p className="mt-2 text-[#7A6255]">أنشئ حساب الكوفي وابدأ التحكم</p>
          </div>

          <div className="grid grid-cols-2 rounded-2xl overflow-hidden border border-[#D8C5B5] mb-8">
            <Link href="/" className="py-4 bg-white font-bold text-center">تسجيل الدخول</Link>
            <button className="py-4 bg-[#E9D8C8] font-bold">إنشاء حساب</button>
          </div>

          <form className="space-y-5">
            <input placeholder="اسم صاحب الكوفي" className="w-full h-14 rounded-2xl border border-[#E5D8CD] px-5 text-right outline-none" />
            <input placeholder="اسم الكوفي" className="w-full h-14 rounded-2xl border border-[#E5D8CD] px-5 text-right outline-none" />
            <input type="email" placeholder="البريد الإلكتروني" className="w-full h-14 rounded-2xl border border-[#E5D8CD] px-5 text-right outline-none" />
            <input placeholder="رقم الجوال" className="w-full h-14 rounded-2xl border border-[#E5D8CD] px-5 text-right outline-none" />
            <input type="password" placeholder="كلمة المرور" className="w-full h-14 rounded-2xl border border-[#E5D8CD] px-5 text-right outline-none" />

            <Link href="/dashboard" className="flex items-center justify-center w-full h-16 rounded-2xl bg-[#3A2117] text-[#F8E8D2] font-black text-lg">
              تسجيل
            </Link>
          </form>
        </div>
      </section>
    </main>
  );
}