"use client";

import {
  CalendarDays,
  Check,
  Clock,
  Edit3,
  Eye,
  EyeOff,
  ImageIcon,
  PackagePlus,
  Plus,
  FileSpreadsheet,
  Printer,
  QrCode,
  Search,
  Settings2,
  Upload,
  Users,
  Video,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  confirmOwnerReservationCodeAction,
  updateReservationStatusAction,
} from "@/app/actions/reservations";
import { saveReservationServiceAction } from "@/app/actions/platform-upgrade";
import {
  uploadImageAction,
  uploadReservationVideoAction,
} from "@/app/actions/upload";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  FilterBar,
  NeumoInput,
  NeumoTextarea,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { formatSar } from "@/lib/format";
import { optimizeImageForStorage } from "@/lib/cafe/image-asset-pipeline";
import type { ReservationService } from "@/lib/data/platform-upgrade";
import {
  RESERVATION_SERVICE_NAMES,
  type ReservationDurationUnit,
} from "@/lib/mock/reservation-services";
import {
  type CafeReservation,
  type ReservationStatus,
} from "@/lib/mock/reservations";
import type { MenuProduct } from "@/lib/mock/menu";
import { SecureQrCode } from "@/components/loyalty/secure-qr-code";
import { BarcodeCameraScanner } from "@/components/loyalty/barcode-camera-scanner";
import { parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import {
  exportRowsToExcel,
  exportRowsToPdf,
} from "@/lib/export/admin-report-export";
import { printThermalReceipt } from "@/lib/print/thermal";
import { getBusinessCopy } from "@/lib/platform/business-copy";

type Props = {
  initialReservations: CafeReservation[];
  initialServices?: ReservationService[];
  menuProducts?: MenuProduct[];
  businessCategory?: string;
  configError?: string;
};

type ActionKind = "accept" | "reject" | "modify";

const DEFAULT_AMENITIES = [
  "منتجات مجانية مع الحجز",
  "جهاز دخان مسرحي",
  "دفاية",
  "مظلة",
];
const DURATION_UNITS: Array<{ value: ReservationDurationUnit; label: string }> =
  [
    { value: "minute", label: "دقيقة" },
    { value: "hour", label: "ساعة" },
    { value: "day", label: "يوم" },
  ];

function splitLines(value: string) {
  return value
    .split(/\n|،|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueList(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function durationLabel(service: ReservationService) {
  if (!service.durationValue || !service.durationUnit) return "بدون مدة محددة";
  const unit =
    service.durationUnit === "day"
      ? "يوم"
      : service.durationUnit === "hour"
        ? "ساعة"
        : "دقيقة";
  return `${service.durationValue} ${unit}`;
}

export function ReservationsPageClient({
  initialReservations,
  initialServices = [],
  menuProducts = [],
  businessCategory,
  configError,
}: Props) {
  const copy = getBusinessCopy(businessCategory);
  const [reservations, setReservations] =
    useState<CafeReservation[]>(initialReservations);
  const [services, setServices] =
    useState<ReservationService[]>(initialServices);
  const [query, setQuery] = useState("");
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string>(
    RESERVATION_SERVICE_NAMES[0],
  );
  const [customName, setCustomName] = useState("");
  const [serviceDescription, setServiceDescription] = useState(
    "حجز مخصص حسب إعدادات العلامة التجارية",
  );
  const [servicePrice, setServicePrice] = useState("");
  const [serviceGuests, setServiceGuests] = useState("");
  const [durationValue, setDurationValue] = useState("");
  const [durationUnit, setDurationUnit] =
    useState<ReservationDurationUnit>("hour");
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [customAmenities, setCustomAmenities] = useState("");
  const [selectedProductNames, setSelectedProductNames] = useState<string[]>(
    [],
  );
  const [customFreeProducts, setCustomFreeProducts] = useState("");
  const [serviceImageAssetId, setServiceImageAssetId] = useState("");
  const [serviceVideoAssetId, setServiceVideoAssetId] = useState("");
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingVideoFile, setPendingVideoFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | undefined>();
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | undefined>();
  const [mediaUploading, setMediaUploading] = useState(false);
  const [serviceActive, setServiceActive] = useState(true);
  const [actionTarget, setActionTarget] = useState<{
    id: string;
    kind: ActionKind;
  } | null>(null);
  const [cafeMessage, setCafeMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reservationCheckinCode, setReservationCheckinCode] = useState("");
  const [checkinMessage, setCheckinMessage] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      reservations.filter(
        (r) =>
          r.customerName.includes(query) ||
          r.phone.includes(query) ||
          r.type.includes(query) ||
          (r.eventTitle?.includes(query) ?? false),
      ),
    [reservations, query],
  );
  const pending = reservations.filter(
    (r) => r.status === "بانتظار الرد",
  ).length;
  const accepted = reservations.filter((r) => r.status === "مقبول").length;
  const guests = reservations.reduce((sum, r) => sum + r.guests, 0);

  const serviceName = customName.trim() || selectedName;
  const isEditing = Boolean(editingServiceId);

  function resetServiceForm() {
    setEditingServiceId(null);
    setSelectedName(RESERVATION_SERVICE_NAMES[0]);
    setCustomName("");
    setServiceDescription("حجز مخصص حسب إعدادات العلامة التجارية");
    setServicePrice("");
    setServiceGuests("");
    setDurationValue("");
    setDurationUnit("hour");
    setSelectedAmenities([]);
    setCustomAmenities("");
    setSelectedProductNames([]);
    setCustomFreeProducts("");
    setServiceImageAssetId("");
    setServiceVideoAssetId("");
    if (imagePreviewUrl?.startsWith("blob:"))
      URL.revokeObjectURL(imagePreviewUrl);
    if (videoPreviewUrl?.startsWith("blob:"))
      URL.revokeObjectURL(videoPreviewUrl);
    setPendingImageFile(null);
    setPendingVideoFile(null);
    setImagePreviewUrl(undefined);
    setVideoPreviewUrl(undefined);
    setServiceActive(true);
  }

  function editService(service: ReservationService) {
    const listed = RESERVATION_SERVICE_NAMES.find(
      (name) => name === service.name,
    );
    setEditingServiceId(service.id);
    setSelectedName(listed ?? RESERVATION_SERVICE_NAMES[0]);
    setCustomName(listed ? "" : service.name);
    setServiceDescription(service.description || "");
    setServicePrice(service.price ? String(service.price) : "");
    setServiceGuests(service.maxGuests ? String(service.maxGuests) : "");
    setDurationValue(
      service.durationValue ? String(service.durationValue) : "",
    );
    setDurationUnit(service.durationUnit ?? "hour");
    setSelectedAmenities(
      service.amenities.filter((item) => DEFAULT_AMENITIES.includes(item)),
    );
    setCustomAmenities(
      service.amenities
        .filter((item) => !DEFAULT_AMENITIES.includes(item))
        .join("\n"),
    );
    const menuNames = new Set(menuProducts.map((product) => product.name));
    setSelectedProductNames(
      service.includedProducts.filter((item) => menuNames.has(item)),
    );
    setCustomFreeProducts(
      service.includedProducts
        .filter((item) => !menuNames.has(item))
        .join("\n"),
    );
    setServiceImageAssetId(service.imageAssetId ?? "");
    setServiceVideoAssetId(service.videoAssetId ?? "");
    if (imagePreviewUrl?.startsWith("blob:"))
      URL.revokeObjectURL(imagePreviewUrl);
    if (videoPreviewUrl?.startsWith("blob:"))
      URL.revokeObjectURL(videoPreviewUrl);
    setPendingImageFile(null);
    setPendingVideoFile(null);
    setImagePreviewUrl(undefined);
    setVideoPreviewUrl(undefined);
    setServiceActive(service.active);
  }

  async function confirmAction() {
    if (!actionTarget) return;
    const statusMap: Record<ActionKind, ReservationStatus> = {
      accept: "مقبول",
      reject: "مرفوض",
      modify: "طلب تعديل",
    };
    const nextStatus = statusMap[actionTarget.kind];
    setBusy(true);
    try {
      const result = await updateReservationStatusAction(
        actionTarget.id,
        nextStatus,
        cafeMessage,
        cafeMessage,
      );
      if (result.ok)
        setReservations((current) =>
          current.map((r) =>
            r.id === actionTarget.id ? result.reservation : r,
          ),
        );
      setActionTarget(null);
      setCafeMessage("");
    } finally {
      setBusy(false);
    }
  }

  function exportReservations(format: "pdf" | "excel") {
    const rows = reservations.map((reservation) => ({
      id: reservation.id,
      customer: reservation.customerName,
      phone: reservation.phone,
      type: reservation.type,
      date: reservation.date,
      time: reservation.time,
      guests: String(reservation.guests),
      status: reservation.status,
      code: reservation.reservationCode ?? "-",
    }));
    const columns = [
      { key: "id", title: "رقم الحجز" },
      { key: "customer", title: "العميل" },
      { key: "phone", title: "الجوال" },
      { key: "type", title: "نوع الحجز" },
      { key: "date", title: "التاريخ" },
      { key: "time", title: "الوقت" },
      { key: "guests", title: "الأشخاص" },
      { key: "status", title: "الحالة" },
      { key: "code", title: "كود الحضور" },
    ];
    if (format === "pdf") exportRowsToPdf("تقرير الحجوزات", rows, columns);
    else exportRowsToExcel("reservations-report", rows, columns);
  }

  function printReservationsSummary() {
    printThermalReceipt({
      title: "تقرير الحجوزات",
      cafeName: "برندة",
      lines: [
        { label: "إجمالي الحجوزات", value: reservations.length, strong: true },
        { label: "بانتظار الرد", value: pending },
        { label: "مقبولة", value: accepted },
        { label: "عدد الأشخاص", value: guests },
        { label: "وقت الطباعة", value: new Date().toLocaleString("ar-SA") },
      ],
    });
  }

  function printReservationThermal(reservation: CafeReservation) {
    printThermalReceipt({
      title: "طلب حجز",
      cafeName: "برندة",
      subtitle: reservation.status,
      lines: [
        { label: "العميل", value: reservation.customerName, strong: true },
        { label: "الجوال", value: reservation.phone },
        { label: "نوع الحجز", value: reservation.type },
        { label: "التاريخ", value: reservation.date },
        { label: "الوقت", value: reservation.time },
        { label: "عدد الأشخاص", value: reservation.guests },
        { label: "الحالة", value: reservation.status },
        { label: "كود الحضور", value: reservation.reservationCode ?? "-" },
        { label: "ملاحظات", value: reservation.notes ?? "-" },
      ],
      paperSize: "80mm",
    });
  }

  async function confirmReservationAttendance(codeInput?: string) {
    const raw = (codeInput ?? reservationCheckinCode).trim();
    if (!raw) {
      setCheckinMessage("أدخل QR أو كود الحجز");
      return alert("أدخل QR أو كود الحجز");
    }
    const code = parseBarndaksaQrPayload(raw, "reservation") ?? raw.toUpperCase();
    setBusy(true);
    setCheckinMessage(null);
    try {
      const result = await confirmOwnerReservationCodeAction(code);
      setReservationCheckinCode("");
      setReservations((current) =>
        current.map((item) =>
          item.id === result.reservationId
            ? {
                ...item,
                reservationCodeUsedAt: new Date().toISOString(),
                cashierConfirmedAt: new Date().toISOString(),
              }
            : item,
        ),
      );
      const message = `تم تأكيد حضور ${String(result.customerName ?? "العميل")}`;
      setCheckinMessage(message);
      alert(message);
    } catch (error) {
      const rawMessage =
        error instanceof Error ? error.message : "كود الحجز غير صالح أو مستخدم مسبقًا";
      const message = rawMessage.includes("مستخدم") || rawMessage.toLowerCase().includes("used")
        ? "تم استخدام هذا الكود سابقًا"
        : rawMessage.includes("غير صالح") || rawMessage.toLowerCase().includes("not found")
          ? "كود الحجز غير صحيح أو الحجز غير مقبول"
          : rawMessage;
      setCheckinMessage(message);
      alert(message);
    } finally {
      setBusy(false);
    }
  }

  async function saveService() {
    if (!serviceName.trim()) return alert("اكتب نوع الحجز");
    const maxGuests = serviceGuests ? Number(serviceGuests) : null;
    if (maxGuests !== null && (!Number.isInteger(maxGuests) || maxGuests <= 0))
      return alert("اكتب العدد الاستيعابي بشكل صحيح");
    const price = Number(servicePrice || 0);
    if (Number.isNaN(price) || price < 0)
      return alert("اكتب سعر الحجز بشكل صحيح");
    const durationNumber = durationValue ? Number(durationValue) : null;
    if (
      durationNumber !== null &&
      (Number.isNaN(durationNumber) || durationNumber <= 0)
    )
      return alert("اكتب مدة الحجز بشكل صحيح أو اتركها فارغة");

    const amenities = uniqueList([
      ...selectedAmenities,
      ...splitLines(customAmenities),
    ]);
    const includedProducts = uniqueList([
      ...selectedProductNames,
      ...splitLines(customFreeProducts),
    ]);
    const serviceId = editingServiceId ?? crypto.randomUUID();
    let imageAssetId = serviceImageAssetId.trim() || undefined;
    let videoAssetId = serviceVideoAssetId.trim() || undefined;

    setMediaUploading(true);
    try {
      if (pendingImageFile) {
        const optimized = await optimizeImageForStorage(
          pendingImageFile,
          "marketing-image",
        );
        const formData = new FormData();
        formData.append("file", optimized.blob, optimized.fileName);
        const uploaded = await uploadImageAction(
          "marketing-assets",
          formData,
          "marketing",
          serviceId,
        );
        imageAssetId = uploaded.storagePath;
      }

      if (pendingVideoFile) {
        const formData = new FormData();
        formData.append("file", pendingVideoFile, pendingVideoFile.name);
        const uploaded = await uploadReservationVideoAction(
          formData,
          serviceId,
        );
        videoAssetId = uploaded.storagePath;
      }

      const payload = {
        id: serviceId,
        name: serviceName.trim(),
        description: serviceDescription.trim(),
        isFree: price <= 0,
        price,
        maxGuests,
        availableSlots: [],
        amenities,
        includedProducts,
        durationValue: durationNumber,
        durationUnit: durationNumber ? durationUnit : null,
        imageAssetId,
        videoAssetId,
        active: serviceActive,
        sortOrder: editingServiceId
          ? (services.find((item) => item.id === editingServiceId)?.sortOrder ??
            0)
          : services.length,
      };

      const id = await saveReservationServiceAction(payload);
      const saved: ReservationService = {
        id,
        name: payload.name,
        description: payload.description,
        isFree: payload.isFree,
        price: payload.price,
        maxGuests: payload.maxGuests,
        availableSlots: [],
        amenities,
        includedProducts,
        durationValue: durationNumber,
        durationUnit: payload.durationUnit,
        imageAssetId: payload.imageAssetId,
        videoAssetId: payload.videoAssetId,
        active: payload.active,
        sortOrder: payload.sortOrder,
      };
      setServices((current) =>
        editingServiceId
          ? current.map((item) => (item.id === id ? saved : item))
          : [saved, ...current],
      );
      resetServiceForm();
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر حفظ بطاقة الحجز");
    } finally {
      setMediaUploading(false);
    }
  }

  async function toggleService(service: ReservationService) {
    const id = await saveReservationServiceAction({
      ...service,
      active: !service.active,
      availableSlots: [],
    });
    setServices((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, active: !item.active, availableSlots: [] }
          : item,
      ),
    );
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="الحجوزات"
        subtitle="إدارة بطاقات الحجز وطلبات العملاء بدون تحديد أوقات متاحة مسبقًا"
      >
        {configError ? (
          <SoftCard className="mb-4 p-4 font-black text-amber-700">
            {configError}
          </SoftCard>
        ) : null}
        <div className="mb-6 flex flex-wrap gap-3">
          <button
            onClick={printReservationsSummary}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#3A2117] px-5 py-3 font-black text-white"
          >
            <Printer className="h-4 w-4" /> طباعة حرارية
          </button>
          <button
            onClick={() => exportReservations("pdf")}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#F8F4EF] px-5 py-3 font-black text-[#3A2117]"
          >
            <FileSpreadsheet className="h-4 w-4" /> PDF
          </button>
          <button
            onClick={() => exportReservations("excel")}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#D9A33F] px-5 py-3 font-black text-[#311912]"
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
        </div>
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label="بانتظار الرد" value={pending} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="مقبولة" value={accepted} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="عدد الأشخاص" value={guests} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="بطاقات الحجز" value={services.length} />
          </BentoCard>
        </BentoGrid>

        <BentoGrid className="mb-6">
          <BentoCard variant="white" span="4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <Settings2 className="h-6 w-6 text-[#6B3A25]" />
                <h2 className="text-2xl font-black">إدارة بطاقات الحجز</h2>
              </div>
              {isEditing ? (
                <button
                  onClick={resetServiceForm}
                  className="rounded-2xl bg-[#F8F4EF] px-4 py-2 font-black text-[#3A2117]"
                >
                  إضافة بطاقة جديدة بدل التعديل
                </button>
              ) : null}
            </div>
            <p className="mt-2 font-bold text-[#7A6255]">
              الحجز متاح للعميل طوال اليوم، والعميل يحدد التاريخ والوقت من صفحة
              {copy.brandNoun}. الخدمات والمنتجات المجانية اختيارية بالكامل.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <select
                value={selectedName}
                onChange={(e) => setSelectedName(e.target.value)}
                className="rounded-2xl bg-[#F8F4EF] px-4 py-3 font-black text-[#3A2117] outline-none"
              >
                {RESERVATION_SERVICE_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <NeumoInput
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="نوع حجز آخر غير موجود في القائمة"
              />
              <NeumoInput
                value={serviceGuests}
                onChange={(e) => setServiceGuests(e.target.value)}
                placeholder="العدد الاستيعابي الأقصى"
                type="number"
                min={1}
              />
              <NeumoInput
                value={servicePrice}
                onChange={(e) => setServicePrice(e.target.value)}
                placeholder="سعر الحجز شامل الضريبة"
                type="number"
                min={0}
              />
              <NeumoInput
                value={durationValue}
                onChange={(e) => setDurationValue(e.target.value)}
                placeholder="المدة اختيارية"
                type="number"
                min={0}
              />
              <select
                value={durationUnit}
                onChange={(e) =>
                  setDurationUnit(e.target.value as ReservationDurationUnit)
                }
                className="rounded-2xl bg-[#F8F4EF] px-4 py-3 font-black text-[#3A2117] outline-none"
              >
                {DURATION_UNITS.map((unit) => (
                  <option key={unit.value} value={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </div>
            <NeumoTextarea
              className="mt-4"
              value={serviceDescription}
              onChange={(e) => setServiceDescription(e.target.value)}
              placeholder="وصف بطاقة الحجز"
            />
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="rounded-3xl bg-[#F8F4EF] p-4">
                <h3 className="font-black text-[#3A2117]">الخدمات المرافقة</h3>
                <div className="mt-3 space-y-2">
                  {DEFAULT_AMENITIES.map((item) => (
                    <label
                      key={item}
                      className="flex items-center gap-2 text-sm font-bold text-[#6B3A25]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAmenities.includes(item)}
                        onChange={(e) =>
                          setSelectedAmenities((current) =>
                            e.target.checked
                              ? [...current, item]
                              : current.filter((x) => x !== item),
                          )
                        }
                      />
                      {item}
                    </label>
                  ))}
                </div>
                <NeumoTextarea
                  className="mt-3 min-h-20"
                  value={customAmenities}
                  onChange={(e) => setCustomAmenities(e.target.value)}
                  placeholder="خدمات أخرى — كل خدمة بسطر"
                />
              </div>
              <div className="rounded-3xl bg-[#F8F4EF] p-4">
                <h3 className="font-black text-[#3A2117]">
                  منتجات مجانية من المنيو
                </h3>
                <div className="mt-3 max-h-40 space-y-2 overflow-y-auto">
                  {menuProducts.length ? (
                    menuProducts.map((product) => (
                      <label
                        key={product.id}
                        className="flex items-center gap-2 text-sm font-bold text-[#6B3A25]"
                      >
                        <input
                          type="checkbox"
                          checked={selectedProductNames.includes(product.name)}
                          onChange={(e) =>
                            setSelectedProductNames((current) =>
                              e.target.checked
                                ? [...current, product.name]
                                : current.filter((x) => x !== product.name),
                            )
                          }
                        />
                        {product.name}
                      </label>
                    ))
                  ) : (
                    <p className="text-sm font-bold text-[#7A6255]">
                      لا توجد منتجات منيو محفوظة حاليًا
                    </p>
                  )}
                </div>
                <NeumoTextarea
                  className="mt-3 min-h-20"
                  value={customFreeProducts}
                  onChange={(e) => setCustomFreeProducts(e.target.value)}
                  placeholder="منتجات غير مدرجة — كل منتج بسطر"
                />
              </div>
              <div className="rounded-3xl bg-[#F8F4EF] p-4">
                <h3 className="font-black text-[#3A2117]">وسائط الحجز</h3>
                <p className="mt-1 text-xs font-bold text-[#7A6255]">
                  ارفع صورة أو فيديو للحجز. الصور تُضغط تلقائيًا قبل الحفظ،
                  والفيديو يرفع إلى التخزين بدون تخزينه داخل قاعدة البيانات.
                </p>
                <div className="mt-3 grid gap-3">
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-white/70 px-4 py-3 font-black text-[#3A2117]">
                    <span className="inline-flex items-center gap-2">
                      <ImageIcon className="h-4 w-4" /> رفع صورة
                    </span>
                    <Upload className="h-4 w-4" />
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/avif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (imagePreviewUrl?.startsWith("blob:"))
                          URL.revokeObjectURL(imagePreviewUrl);
                        setPendingImageFile(file);
                        setImagePreviewUrl(URL.createObjectURL(file));
                      }}
                    />
                  </label>
                  {imagePreviewUrl ? (
                    <img
                      src={imagePreviewUrl}
                      alt="معاينة صورة الحجز"
                      className="h-32 w-full rounded-2xl object-cover"
                    />
                  ) : serviceImageAssetId ? (
                    <p className="rounded-2xl bg-white/60 px-4 py-3 text-xs font-bold text-[#6B3A25]">
                      تم حفظ صورة للحجز
                    </p>
                  ) : null}
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-white/70 px-4 py-3 font-black text-[#3A2117]">
                    <span className="inline-flex items-center gap-2">
                      <Video className="h-4 w-4" /> رفع فيديو
                    </span>
                    <Upload className="h-4 w-4" />
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 40 * 1024 * 1024) {
                          alert(
                            "حجم الفيديو كبير جدًا، ارفع ملفًا أقل من 40MB",
                          );
                          return;
                        }
                        if (videoPreviewUrl?.startsWith("blob:"))
                          URL.revokeObjectURL(videoPreviewUrl);
                        setPendingVideoFile(file);
                        setVideoPreviewUrl(URL.createObjectURL(file));
                      }}
                    />
                  </label>
                  {videoPreviewUrl ? (
                    <video
                      src={videoPreviewUrl}
                      className="h-32 w-full rounded-2xl object-cover"
                      muted
                      controls
                    />
                  ) : serviceVideoAssetId ? (
                    <p className="rounded-2xl bg-white/60 px-4 py-3 text-xs font-bold text-[#6B3A25]">
                      تم حفظ فيديو للحجز
                    </p>
                  ) : null}
                </div>
                <label className="mt-3 flex items-center gap-2 rounded-2xl bg-white/60 px-4 py-3 font-black">
                  <input
                    type="checkbox"
                    checked={serviceActive}
                    onChange={(e) => setServiceActive(e.target.checked)}
                  />{" "}
                  البطاقة مفعلة
                </label>
              </div>
            </div>
            <button
              onClick={() => void saveService()}
              disabled={mediaUploading}
              className="mt-5 rounded-2xl bg-[#3A2117] px-6 py-3 font-black text-white disabled:opacity-60"
            >
              <Plus className="inline h-4 w-4" />{" "}
              {mediaUploading
                ? "جاري الحفظ والرفع..."
                : isEditing
                  ? "حفظ تعديل بطاقة الحجز"
                  : "إضافة بطاقة حجز"}
            </button>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {services.map((service) => (
                <div key={service.id} className="rounded-2xl bg-[#F8F4EF] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-black">{service.name}</h3>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-black ${service.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                    >
                      {service.active ? "مفعل" : "متوقف"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-[#7A6255]">
                    {service.description}
                  </p>
                  <p className="mt-2 font-black text-[#6B3A25]">
                    {formatSar(service.price ?? 0)}{" "}
                    <span className="text-xs text-[#7A6255]">شامل الضريبة</span>
                  </p>
                  <p className="text-xs font-bold text-[#7A6255]">
                    السعة: {service.maxGuests ?? "غير محددة"} • المدة:{" "}
                    {durationLabel(service)}
                  </p>
                  {service.amenities.length ? (
                    <p className="mt-2 text-xs font-bold text-[#7A6255]">
                      الخدمات: {service.amenities.join("، ")}
                    </p>
                  ) : null}
                  {service.includedProducts.length ? (
                    <p className="mt-1 text-xs font-bold text-[#7A6255]">
                      المجاني: {service.includedProducts.join("، ")}
                    </p>
                  ) : null}
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => editService(service)}
                      className="flex-1 rounded-xl bg-white px-3 py-2 text-xs font-black text-[#3A2117]"
                    >
                      <Edit3 className="inline h-3.5 w-3.5" /> تعديل
                    </button>
                    <button
                      onClick={() => void toggleService(service)}
                      className="flex-1 rounded-xl bg-white px-3 py-2 text-xs font-black text-[#3A2117]"
                    >
                      {service.active ? (
                        <EyeOff className="inline h-3.5 w-3.5" />
                      ) : (
                        <Eye className="inline h-3.5 w-3.5" />
                      )}{" "}
                      {service.active ? "إيقاف" : "تفعيل"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </BentoCard>
        </BentoGrid>

        <BentoCard variant="white" span="4" className="mb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black text-[#D9A33F]">
                تأكيد حضور الحجز
              </p>
              <h2 className="mt-1 text-2xl font-black text-[#3A2117]">
                قراءة QR حضور الحجز لمرة واحدة
              </h2>
              <p className="mt-1 text-sm font-bold text-[#7A6255]">
                يقبل فقط الحجوزات المقبولة، وبعد التأكيد يتوقف الكود نهائيًا.
              </p>
            </div>
            <div className="grid min-w-0 flex-1 gap-3 lg:max-w-xl">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <NeumoInput
                  value={reservationCheckinCode}
                  onChange={(event) =>
                    setReservationCheckinCode(event.target.value.toUpperCase())
                  }
                  placeholder="امسح QR الحجز أو اكتب الكود"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void confirmReservationAttendance()}
                  className="rounded-2xl bg-[#3A2117] px-5 py-3 font-black text-white disabled:opacity-60"
                >
                  <QrCode className="inline h-4 w-4" /> تأكيد الحضور
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <BarcodeCameraScanner
                  label="مسح QR بالكاميرا"
                  expectedKind="reservation"
                  onDetected={(value) => {
                    setReservationCheckinCode(value.toUpperCase());
                    void confirmReservationAttendance(value);
                  }}
                />
                {checkinMessage ? (
                  <p className="rounded-2xl bg-[#FFF8EA] px-4 py-3 text-sm font-black text-[#6B3A25]">
                    {checkinMessage}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </BentoCard>

        <FilterBar>
          <div className="relative flex-1">
            <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7A6255]" />
            <NeumoInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث باسم العميل أو الجوال أو نوع الحجز"
              className="pr-12"
            />
          </div>
        </FilterBar>
        <BentoGrid>
          <BentoCard variant="white" span="4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-separate border-spacing-y-3 text-right">
                <thead>
                  <tr className="text-xs font-black text-[#7A6255]">
                    <th className="px-4 py-2">الفرع</th>
                    <th className="px-4 py-2">نوع الحجز</th>
                    <th className="px-4 py-2">الاسم</th>
                    <th className="px-4 py-2">التاريخ</th>
                    <th className="px-4 py-2">الوقت</th>
                    <th className="px-4 py-2">الحالة</th>
                    <th className="px-4 py-2">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="rounded-r-3xl bg-[#F8F4EF] px-4 py-4 font-bold text-[#3A2117]">
                        {r.branchName || "-"}
                      </td>
                      <td className="bg-[#F8F4EF] px-4 py-4">
                        <p className="font-black text-[#3A2117]">{r.serviceName || r.type}</p>
                        <p className="mt-1 text-xs font-bold text-[#7A6255]">
                          {r.guests} أشخاص {r.reservationPrice ? `• ${formatSar(r.reservationPrice)}` : ""}
                        </p>
                      </td>
                      <td className="bg-[#F8F4EF] px-4 py-4">
                        <p className="font-black text-[#3A2117]">{r.customerName}</p>
                        <p className="mt-1 text-xs font-bold text-[#7A6255]">{r.phone}</p>
                      </td>
                      <td className="bg-[#F8F4EF] px-4 py-4 font-bold text-[#3A2117]">{r.date}</td>
                      <td className="bg-[#F8F4EF] px-4 py-4 font-bold text-[#3A2117]">{r.time}</td>
                      <td className="bg-[#F8F4EF] px-4 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black ${
                            r.status === "مقبول"
                              ? "bg-green-100 text-green-700"
                              : r.status === "مرفوض"
                                ? "bg-red-100 text-red-700"
                                : r.status === "طلب تعديل"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {r.status}
                        </span>
                        {r.notes ? (
                          <p className="mt-2 line-clamp-2 text-xs font-bold text-[#7A6255]">{r.notes}</p>
                        ) : null}
                      </td>
                      <td className="rounded-l-3xl bg-[#F8F4EF] px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => setActionTarget({ id: r.id, kind: "accept" })}
                            className="rounded-xl bg-green-100 px-3 py-2 text-xs font-black text-green-700"
                          >
                            <Check className="inline h-3.5 w-3.5" /> قبول
                          </button>
                          <button
                            onClick={() => setActionTarget({ id: r.id, kind: "modify" })}
                            className="rounded-xl bg-blue-100 px-3 py-2 text-xs font-black text-blue-700"
                          >
                            <Clock className="inline h-3.5 w-3.5" /> تعديل
                          </button>
                          <button
                            onClick={() => setActionTarget({ id: r.id, kind: "reject" })}
                            className="rounded-xl bg-red-100 px-3 py-2 text-xs font-black text-red-700"
                          >
                            <X className="inline h-3.5 w-3.5" /> رفض
                          </button>
                          <button
                            onClick={() => printReservationThermal(r)}
                            className="rounded-xl bg-white px-3 py-2 text-xs font-black text-[#3A2117]"
                          >
                            <Printer className="inline h-3.5 w-3.5" /> طباعة
                          </button>
                        </div>
                        {r.status === "مقبول" && r.reservationCode ? (
                          <div className="mt-4 w-full rounded-3xl border border-[#E7D7C6] bg-white p-5">
                            <div className="grid gap-4 xl:grid-cols-[176px_1fr] xl:items-center">
                              <SecureQrCode
                                kind="reservation"
                                value={r.reservationCode}
                                title={`QR حضور الحجز ${r.reservationCode}`}
                                size={160}
                                className="mx-auto"
                              />
                              <div>
                                <p className="font-black text-[#3A2117]">QR حضور الحجز</p>
                                <p className="mt-2 break-all font-mono text-xs font-black tracking-[0.12em] text-[#6B3A25]">
                                  {r.reservationCode}
                                </p>
                                {!r.reservationCodeUsedAt ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void confirmReservationAttendance(r.reservationCode)}
                                    className="mt-3 rounded-2xl bg-[#3A2117] px-4 py-2 text-xs font-black text-white disabled:opacity-60"
                                  >
                                    تأكيد الحضور
                                  </button>
                                ) : (
                                  <p className="mt-2 text-xs font-bold text-green-700">تم استخدام QR</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length ? (
                <p className="rounded-3xl bg-[#F8F4EF] p-5 text-center font-bold text-[#7A6255]">
                  لا توجد حجوزات مطابقة للبحث.
                </p>
              ) : null}
            </div>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
      {actionTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[28px] bg-[#FDFBF8] p-6 shadow-xl">
            <h3 className="text-xl font-black text-[#3A2117]">
              تأكيد إجراء الحجز
            </h3>
            <NeumoTextarea
              value={cafeMessage}
              onChange={(e) => setCafeMessage(e.target.value)}
              placeholder="رسالة للعميل أو سبب الرفض أو اقتراح وقت/مساحة بديلة"
              className="mt-4 h-28"
            />
            <div className="mt-4 flex gap-2">
              <button
                disabled={busy}
                onClick={confirmAction}
                className="flex-1 rounded-2xl bg-[#3A2117] px-4 py-3 font-black text-[#F8F4EF]"
              >
                تأكيد
              </button>
              <button
                onClick={() => setActionTarget(null)}
                className="rounded-2xl bg-[#F8F4EF] px-4 py-3 font-black text-[#3A2117]"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Info({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="rounded-2xl bg-[#F8F4EF] p-4">
      <p className="flex items-center gap-1 text-xs font-black text-[#7A6255]">
        {Icon ? <Icon className="h-4 w-4" /> : null}
        {label}
      </p>
      <h3 className="mt-1 font-black text-[#3A2117]">{value}</h3>
    </div>
  );
}
