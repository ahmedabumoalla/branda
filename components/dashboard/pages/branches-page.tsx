"use client";

import { ExternalLink, LocateFixed, MapPin, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  BRANCHES_KEY,
  buildGoogleMapsUrl,
  mockBranches,
  type CafeBranch,
} from "@/lib/mock/branches";

export function BranchesPageClient() {
  const [branches, setBranches] = useState<CafeBranch[]>(mockBranches);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("جدة");
  const [distanceKm, setDistanceKm] = useState("");
  const [phone, setPhone] = useState("");
  const [workingHours, setWorkingHours] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(BRANCHES_KEY);
    if (saved) setBranches(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem(BRANCHES_KEY, JSON.stringify(branches));
  }, [branches]);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      alert("المتصفح لا يدعم تحديد الموقع");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLat = position.coords.latitude.toFixed(7);
        const nextLng = position.coords.longitude.toFixed(7);
        const nextUrl = buildGoogleMapsUrl(Number(nextLat), Number(nextLng));

        setLat(nextLat);
        setLng(nextLng);
        setMapUrl(nextUrl);

        window.open(nextUrl, "_blank");
      },
      () => {
        alert("لم يتم السماح بالوصول للموقع");
      },
      {
        enableHighAccuracy: true,
      }
    );
  }

  function openGoogleMapsPicker() {
    const query = address || name || "Jeddah cafe";
    const url = lat && lng ? buildGoogleMapsUrl(Number(lat), Number(lng)) : `https://www.google.com/maps/search/${encodeURIComponent(query)}`;

    window.open(url, "_blank");
  }

  function addBranch() {
    if (!name.trim() || !address.trim()) {
      alert("اكتب اسم الفرع والعنوان");
      return;
    }

    const finalLat = lat ? Number(lat) : undefined;
    const finalLng = lng ? Number(lng) : undefined;
    const finalMapUrl = mapUrl.trim() || buildGoogleMapsUrl(finalLat, finalLng, undefined);

    const branch: CafeBranch = {
      id: crypto.randomUUID(),
      name: name.trim(),
      address: address.trim(),
      city: city.trim() || "جدة",
      distanceKm: distanceKm ? Number(distanceKm) : undefined,
      phone: phone.trim() || undefined,
      workingHours: workingHours.trim() || "غير محدد",
      lat: finalLat,
      lng: finalLng,
      mapUrl: finalMapUrl,
      active: true,
    };

    setBranches((prev) => [branch, ...prev]);

    setName("");
    setAddress("");
    setCity("جدة");
    setDistanceKm("");
    setPhone("");
    setWorkingHours("");
    setMapUrl("");
    setLat("");
    setLng("");
  }

  return (
    <div dir="rtl" className="min-h-screen px-6 py-8 text-[#2B1710]">
      <header className="mb-8">
        <p className="font-black text-[#8B5E3C]">لوحة برندة</p>
        <h1 className="mt-2 text-4xl font-black text-[#3A2117]">فروع الكوفي</h1>
        <p className="mt-2 text-[#7A6255]">
          حدّد موقع الفرع من خرائط قوقل، واحفظه ليظهر للعميل في صفحة الحجز والفروع.
        </p>
      </header>

      <section className="mb-8 grid gap-5 xl:grid-cols-[1fr_440px]">
        <div className="grid gap-5">
          {branches.map((branch) => {
            const url = branch.mapUrl || buildGoogleMapsUrl(branch.lat, branch.lng);

            return (
              <article key={branch.id} className="rounded-3xl border border-white bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8E8D2]">
                      <MapPin className="h-7 w-7" />
                    </div>

                    <div>
                      <h2 className="text-2xl font-black text-[#3A2117]">{branch.name}</h2>
                      <p className="mt-2 font-bold text-[#7A6255]">{branch.address}</p>
                      <p className="mt-1 text-sm font-bold text-[#8A7062]">
                        {branch.city} • {branch.workingHours}
                      </p>

                      {branch.lat && branch.lng ? (
                        <p className="mt-2 text-xs font-black text-[#8B5E3C]">
                          {branch.lat}, {branch.lng}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a
                      href={url}
                      target="_blank"
                      className="inline-flex items-center gap-2 rounded-2xl bg-[#3A2117] px-5 py-3 font-black text-[#F8E8D2]"
                    >
                      <ExternalLink className="h-4 w-4" />
                      فتح الخريطة
                    </a>

                    <button
                      onClick={() =>
                        setBranches((prev) =>
                          prev.map((item) =>
                            item.id === branch.id ? { ...item, active: !item.active } : item
                          )
                        )
                      }
                      className="rounded-2xl bg-[#F8F4EF] px-5 py-3 font-black text-[#3A2117]"
                    >
                      {branch.active ? "إخفاء" : "إظهار"}
                    </button>

                    <button
                      onClick={() => setBranches((prev) => prev.filter((item) => item.id !== branch.id))}
                      className="rounded-2xl bg-red-50 px-5 py-3 font-black text-red-700"
                    >
                      <Trash2 className="inline h-4 w-4" /> حذف
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="rounded-3xl border border-[#E5D8CD] bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-black">
            <Plus className="h-5 w-5" />
            إضافة فرع
          </h2>

          <div className="space-y-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الفرع" className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-4 text-right outline-none" />
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="العنوان" className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-4 text-right outline-none" />
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="المدينة" className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-4 text-right outline-none" />
            <input value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} placeholder="المسافة كم اختياري" className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-4 text-right outline-none" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="رقم الفرع" className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-4 text-right outline-none" />
            <input value={workingHours} onChange={(e) => setWorkingHours(e.target.value)} placeholder="أوقات العمل" className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-4 text-right outline-none" />

            <div className="rounded-3xl bg-[#F8F4EF] p-4">
              <p className="mb-3 font-black text-[#3A2117]">موقع الفرع</p>

              <div className="grid grid-cols-2 gap-2">
                <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude" className="h-12 rounded-2xl border border-[#E5D8CD] px-3 text-right outline-none" />
                <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Longitude" className="h-12 rounded-2xl border border-[#E5D8CD] px-3 text-right outline-none" />
              </div>

              <input value={mapUrl} onChange={(e) => setMapUrl(e.target.value)} placeholder="رابط Google Maps يتولد تلقائيًا أو الصقه هنا" className="mt-2 h-12 w-full rounded-2xl border border-[#E5D8CD] px-3 text-right outline-none" />

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={useCurrentLocation} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#3A2117] font-black text-[#F8E8D2]">
                  <LocateFixed className="h-4 w-4" />
                  موقعي الحالي
                </button>

                <button onClick={openGoogleMapsPicker} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white font-black text-[#3A2117]">
                  <MapPin className="h-4 w-4" />
                  فتح قوقل ماب
                </button>
              </div>

              <p className="mt-3 text-xs font-bold leading-6 text-[#7A6255]">
                الأفضل: اضغط موقعي الحالي إذا كنت داخل الفرع. أو افتح قوقل ماب وحدد الدبوس ثم انسخ الرابط والصقه.
              </p>
            </div>

            <button onClick={addBranch} className="h-12 w-full rounded-2xl bg-[#3A2117] font-black text-[#F8E8D2]">
              حفظ الفرع والموقع
            </button>
          </div>
        </aside>
      </section>
    </div>
  );
}