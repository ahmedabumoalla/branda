"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, MapPin, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { getCustomerSession, type BrandaCustomerSession } from "@/lib/customer/session";
import { mockReservations, type CafeReservation } from "@/lib/mock/reservations";
import { BRANCHES_KEY, mockBranches, type CafeBranch } from "@/lib/mock/branches";
import { TRANSACTIONS_KEY, type CustomerTransaction } from "@/lib/mock/customer-activity";

const RESERVATIONS_KEY = "branda_qatrah_reservations";

export default function ReservePage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [customer, setCustomer] = useState<BrandaCustomerSession | null>(null);
  const [branches, setBranches] = useState<CafeBranch[]>(mockBranches);
  const [reservations, setReservations] = useState<CafeReservation[]>(mockReservations);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);

  const [branchId, setBranchId] = useState("");
  const [reservationType, setReservationType] = useState<CafeReservation["type"]>("طاولة");
  const [guests, setGuests] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const session = getCustomerSession(slug);
    setCustomer(session);

    const savedBranches = localStorage.getItem(BRANCHES_KEY);
    const savedReservations = localStorage.getItem(RESERVATIONS_KEY);
    const savedTransactions = localStorage.getItem(TRANSACTIONS_KEY);

    if (savedBranches) setBranches(JSON.parse(savedBranches));
    if (savedReservations) setReservations(JSON.parse(savedReservations));
    if (savedTransactions) setTransactions(JSON.parse(savedTransactions));
  }, [slug]);

  useEffect(() => {
    localStorage.setItem(RESERVATIONS_KEY, JSON.stringify(reservations));
  }, [reservations]);

  useEffect(() => {
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
  }, [transactions]);

  const activeBranches = branches.filter((branch) => branch.active);
  const selectedBranch = activeBranches.find((branch) => branch.id === branchId);

  function submitReservation() {
    if (!customer) {
      router.push(`/c/${slug}/login?next=/c/${slug}/reserve`);
      return;
    }

    if (!branchId || !guests || !date || !time) {
      alert("اختر الفرع والتاريخ والوقت وعدد الأشخاص");
      return;
    }

    const createdAt = new Date().toISOString().slice(0, 10);

    const newReservation: CafeReservation = {
      id: crypto.randomUUID(),
      customerId: customer.id,
      customerName: customer.fullName,
      phone: customer.phone,
      type: reservationType,
      guests: Number(guests) || 1,
      date,
      time,
      notes: notes.trim() || `الفرع: ${selectedBranch?.name || ""}`,
      status: "بانتظار الرد",
      createdAt,
    };

    const newTransaction: CustomerTransaction = {
      id: crypto.randomUUID(),
      cafeSlug: slug,
      customerId: customer.id,
      type: "حجز",
      title: `حجز ${reservationType}`,
      description: `حجز في ${selectedBranch?.name} لعدد ${Number(guests) || 1} أشخاص بتاريخ ${date} الساعة ${time}`,
      createdAt,
    };

    setReservations((prev) => [newReservation, ...prev]);
    setTransactions((prev) => [newTransaction, ...prev]);

    alert("تم إرسال طلب الحجز بنجاح");
    router.push(`/c/${slug}/account`);
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#F8F4EF] text-[#2B1710]">
      <section className="mx-auto max-w-7xl px-6 py-8">
        <Link href={`/c/${slug}`} className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-[#3A2117] shadow-sm">
          <ArrowRight className="h-5 w-5" />
          رجوع للكوفي
        </Link>

        <section className="mt-8 overflow-hidden rounded-[42px] border border-[#E5D8CD] bg-[#EFE2D3] p-8 shadow-sm">
          <div className="grid gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
            <div>
              <p className="font-black text-[#8B5E3C]">حجز الطاولات</p>
              <h1 className="mt-2 text-5xl font-black leading-tight text-[#3A2117]">
                احجز مكانك في كوفي قطرة
              </h1>
              <p className="mt-4 max-w-2xl text-lg font-bold leading-8 text-[#6B4A3A]">
                اختر الفرع، نوع الجلسة، الوقت المناسب، وسيصل طلبك مباشرة للكوفي.
              </p>
            </div>

            <div className="rounded-[32px] bg-white/70 p-6 shadow-xl">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl bg-[#F8F4EF] p-4">
                  <MapPin className="mx-auto h-6 w-6 text-[#8B5E3C]" />
                  <p className="mt-2 text-sm font-black">فروع</p>
                  <h3 className="text-2xl font-black">{activeBranches.length}</h3>
                </div>
                <div className="rounded-2xl bg-[#F8F4EF] p-4">
                  <CalendarDays className="mx-auto h-6 w-6 text-[#8B5E3C]" />
                  <p className="mt-2 text-sm font-black">حجز سريع</p>
                  <h3 className="text-2xl font-black">24/7</h3>
                </div>
                <div className="rounded-2xl bg-[#F8F4EF] p-4">
                  <Users className="mx-auto h-6 w-6 text-[#8B5E3C]" />
                  <p className="mt-2 text-sm font-black">جلسات</p>
                  <h3 className="text-2xl font-black">3</h3>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="rounded-[36px] border border-[#E5D8CD] bg-white p-6 shadow-sm">
            <h2 className="text-3xl font-black text-[#3A2117]">بيانات الحجز</h2>

            {!customer ? (
              <div className="mt-6 rounded-2xl bg-[#F8F4EF] p-5">
                <p className="font-black text-[#3A2117]">لازم تسجل دخول قبل الحجز.</p>
                <Link href={`/c/${slug}/login?next=/c/${slug}/reserve`} className="mt-4 inline-flex rounded-2xl bg-[#3A2117] px-6 py-3 font-black text-[#F8E8D2]">
                  تسجيل الدخول
                </Link>
              </div>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-14 rounded-2xl border border-[#E5D8CD] px-4 outline-none">
                  <option value="">اختر الفرع</option>
                  {activeBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>

                <select value={reservationType} onChange={(e) => setReservationType(e.target.value as CafeReservation["type"])} className="h-14 rounded-2xl border border-[#E5D8CD] px-4 outline-none">
                  <option>طاولة</option>
                  <option>جلسة خارجية</option>
                  <option>غرفة خاصة</option>
                </select>

                <input value={guests} onChange={(e) => setGuests(e.target.value)} placeholder="عدد الأشخاص" className="h-14 rounded-2xl border border-[#E5D8CD] px-4 text-right outline-none" />
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-14 rounded-2xl border border-[#E5D8CD] px-4 outline-none" />
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-14 rounded-2xl border border-[#E5D8CD] px-4 outline-none" />

                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات إضافية" className="md:col-span-2 h-28 resize-none rounded-2xl border border-[#E5D8CD] p-4 text-right outline-none" />

                <button onClick={submitReservation} className="md:col-span-2 h-14 rounded-2xl bg-[#3A2117] font-black text-[#F8E8D2]">
                  إرسال طلب الحجز
                </button>
              </div>
            )}
          </div>

          <aside className="rounded-[36px] border border-[#E5D8CD] bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-[#3A2117]">الفروع المتاحة</h2>

            <div className="mt-5 space-y-3">
              {activeBranches.map((branch) => (
                <button
  key={branch.id}
  onClick={() => setBranchId(branch.id)}
  className={`w-full rounded-3xl border p-5 text-right transition ${
    branchId === branch.id
      ? "border-[#3A2117] bg-[#F8F4EF]"
      : "border-[#E5D8CD] bg-white"
  }`}
>
  <h3 className="font-black text-[#3A2117]">{branch.name}</h3>
  <p className="mt-1 text-sm font-bold text-[#7A6255]">{branch.address}</p>
  <p className="mt-2 text-xs font-black text-[#8B5E3C]">
    {branch.distanceKm ? `${branch.distanceKm} كم • ` : ""}
    {branch.workingHours}
  </p>

  {branch.mapUrl ? (
    <a
      href={branch.mapUrl}
      target="_blank"
      onClick={(e) => e.stopPropagation()}
      className="mt-4 inline-flex rounded-2xl bg-[#3A2117] px-4 py-2 text-xs font-black text-[#F8E8D2]"
    >
      فتح الموقع على الخريطة
    </a>
  ) : null}
</button>
              ))}
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}