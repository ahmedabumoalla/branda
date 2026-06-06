"use client";

import { ExternalLink, MapPin, Plus, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { deleteBranchAction, saveBranchAction } from "@/app/actions/branches";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  NeumoInput,
  PrimaryButton,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { buildGoogleMapsUrl, type CafeBranch } from "@/lib/mock/branches";

type Props = {
  initialBranches: CafeBranch[];
  configError?: string;
};

type LocationValue = { lat: number; lng: number };

export function BranchesPageClient({ initialBranches, configError }: Props) {
  const [branches, setBranches] = useState<CafeBranch[]>(initialBranches);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [workingHours, setWorkingHours] = useState("");
  const [location, setLocation] = useState<LocationValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleMapChange = useCallback((value: LocationValue) => setLocation(value), []);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage("المتصفح لا يدعم تحديد الموقع");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
        });
        setMessage("تم تحديد الموقع الحالي");
      },
      () => setMessage("تعذر قراءة الموقع الحالي")
    );
  }

  async function addBranch() {
    if (!name.trim() || !address.trim() || !city.trim() || !location) {
      setMessage("اكتب بيانات الفرع وحدد موقعه على الخريطة");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const saved = await saveBranchAction({
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        phone: phone.trim() || undefined,
        workingHours: workingHours.trim() || "غير محدد",
        lat: location.lat,
        lng: location.lng,
        mapUrl: buildGoogleMapsUrl(location.lat, location.lng),
        active: true,
        id: crypto.randomUUID(),
      });

      setBranches((current) => [saved, ...current]);
      setName("");
      setAddress("");
      setCity("");
      setPhone("");
      setWorkingHours("");
      setLocation(null);
      setMessage("تم حفظ الفرع");
    } catch {
      setMessage("تعذر حفظ الفرع");
    } finally {
      setSaving(false);
    }
  }

  async function toggleVisibility(branch: CafeBranch) {
    try {
      const saved = await saveBranchAction({ ...branch, active: !branch.active });
      setBranches((current) => current.map((item) => (item.id === branch.id ? saved : item)));
    } catch {
      setMessage("تعذر تحديث حالة الفرع");
    }
  }

  async function removeBranch(branchId: string) {
    try {
      await deleteBranchAction(branchId);
      setBranches((current) => current.filter((item) => item.id !== branchId));
    } catch {
      setMessage("تعذر حذف الفرع");
    }
  }

  const activeCount = branches.filter((branch) => branch.active).length;

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="الفروع والمواقع"
        subtitle="حدد مواقع الفروع على الخريطة لتظهر للعملاء في تطبيق برندة والفرع الالكتروني"
      >
        {configError ? (
          <SoftCard className="mb-6 border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            {configError}
          </SoftCard>
        ) : null}

        {message ? (
          <SoftCard className="mb-6 border border-[#D9A33F]/25 bg-[#FFF8EF] p-4 text-sm font-black text-[#6B3A25]">
            {message}
          </SoftCard>
        ) : null}

        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label="إجمالي الفروع" value={branches.length} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="فروع نشطة" value={activeCount} />
          </BentoCard>
          <BentoCard variant="white" span="2">
            <StatPill
              label="مدن مغطاة"
              value={new Set(branches.map((branch) => branch.city)).size}
              hint="مواقع متاحة للعملاء"
            />
          </BentoCard>
        </BentoGrid>

        <BentoGrid>
          <BentoCard variant="white" span="2">
            <div className="grid gap-5">
              {branches.map((branch) => (
                <SoftCard key={branch.id}>
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8F4EF]">
                        <MapPin className="h-7 w-7" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-[#3A2117]">{branch.name}</h2>
                        <p className="mt-2 font-bold text-[#7A6255]">{branch.address}</p>
                        <p className="mt-1 text-sm font-bold text-[#7A6255]">
                          {branch.city} {branch.workingHours ? ` ${branch.workingHours}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <a
                        href={branch.mapUrl || buildGoogleMapsUrl(branch.lat, branch.lng)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-2xl bg-[#3A2117] px-5 py-3 font-black text-[#F8F4EF]"
                      >
                        <ExternalLink className="h-4 w-4" />
                        فتح الخريطة
                      </a>
                      <button
                        type="button"
                        onClick={() => void toggleVisibility(branch)}
                        className="rounded-2xl bg-[#F8F4EF] px-5 py-3 font-black text-[#3A2117]"
                      >
                        {branch.active ? "إخفاء" : "إظهار"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeBranch(branch.id)}
                        className="rounded-2xl bg-red-50 px-5 py-3 font-black text-red-700"
                      >
                        <Trash2 className="inline h-4 w-4" /> حذف
                      </button>
                    </div>
                  </div>
                </SoftCard>
              ))}

              {!branches.length ? (
                <p className="py-8 text-center font-bold text-[#7A6255]">لا توجد فروع بعد</p>
              ) : null}
            </div>
          </BentoCard>

          <BentoCard variant="white" span="2">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-black">
              <Plus className="h-5 w-5" />
              إضافة فرع
            </h2>

            <div className="space-y-3">
              <NeumoInput value={name} onChange={(event) => setName(event.target.value)} placeholder="اسم الفرع" />
              <NeumoInput value={address} onChange={(event) => setAddress(event.target.value)} placeholder="العنوان" />
              <NeumoInput value={city} onChange={(event) => setCity(event.target.value)} placeholder="المدينة" />
              <NeumoInput value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="رقم الفرع اختياري" />
              <NeumoInput value={workingHours} onChange={(event) => setWorkingHours(event.target.value)} placeholder="أوقات العمل اختياري" />

              <SoftCard className="p-4">
                <p className="mb-3 font-black text-[#3A2117]">موقع الفرع على الخريطة</p>
                <div className="rounded-[28px] border border-[#E5D8CD] bg-white p-4">
                    <p className="font-black text-[#3A2117]">موقع الفرع</p>
                    <p className="mt-1 text-xs font-bold text-[#7A6255]">
                      استخدم الموقع الحالي أو أدخل الإحداثيات يدويًا ثم افتحها في Google Maps للتأكد
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <NeumoInput
                        type="number"
                        step="any"
                        value={location?.lat ?? ""}
                        onChange={(e) =>
                          setLocation((current) => ({
                            lat: Number(e.target.value),
                            lng: current?.lng ?? 0,
                          }))
                        }
                        placeholder="خط العرض"
                      />
                      <NeumoInput
                        type="number"
                        step="any"
                        value={location?.lng ?? ""}
                        onChange={(e) =>
                          setLocation((current) => ({
                            lat: current?.lat ?? 0,
                            lng: Number(e.target.value),
                          }))
                        }
                        placeholder="خط الطول"
                      />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={useCurrentLocation}
                        className="rounded-2xl bg-[#3A2117] px-4 py-3 text-sm font-black text-white"
                      >
                        تحديد موقعي الحالي
                      </button>
                      {location ? (
                        <a
                          href={buildGoogleMapsUrl(location.lat, location.lng)}
                          target="_blank"
                          className="rounded-2xl bg-[#F8F4EF] px-4 py-3 text-sm font-black text-[#3A2117]"
                        >
                          فتح في Google Maps
                        </a>
                      ) : null}
                    </div>
                  </div>
              </SoftCard>

              <PrimaryButton type="button" onClick={() => void addBranch()} disabled={saving} className="w-full">
                {saving ? "جاري الحفظ" : "حفظ الفرع والموقع"}
              </PrimaryButton>
            </div>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
    </div>
  );
}
