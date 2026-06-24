"use client";

import Link from "next/link";
import {
  BadgeCheck,
  ClipboardCheck,
  DoorOpen,
  Gift,
  KeyRound,
  LockKeyhole,
  Plus,
  QrCode,
  ScanLine,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  createLoyaltyCashierAction,
  recordLoyaltyCardOperationAction,
  setLoyaltyCashierStatusAction,
} from "@/app/actions/loyalty-cards";
import { ownerOperationalRedeemExperienceRewardAction } from "@/app/actions/experience-rewards";
import { BarcodeCameraScanner } from "@/components/loyalty/barcode-camera-scanner";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  NeumoInput,
  PrimaryButton,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import type { LoyaltyCardsDashboard } from "@/lib/data/loyalty-cards";
import { getBusinessCopy } from "@/lib/platform/business-copy";

type Props = {
  initialDashboard: LoyaltyCardsDashboard;
  configError?: string;
};

export function OperationalCashierPageClient({
  initialDashboard,
  configError,
}: Props) {
  const copy = getBusinessCopy(initialDashboard.businessCategory);
  const isEvents = copy.kind === "events";
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [cashierName, setCashierName] = useState("");
  const [cashierEmail, setCashierEmail] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [cardCode, setCardCode] = useState("");
  const [rewardCode, setRewardCode] = useState("");
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");

  const labels = isEvents
    ? {
        title: "بوابة الدخول",
        subtitle: "إدارة موظفي البوابة وتأكيد دخول التذاكر ومسح QR الحضور",
        addTitle: "إضافة موظف بوابة",
        addButton: "إضافة موظف بوابة",
        openConsole: "فتح بوابة الدخول",
        scanLoyalty: "تسجيل حضور ولاء",
        scanReward: "صرف مكافأة حضور",
        scanTicket: "مسح تذكرة",
        staffLabel: "موظفو البوابة",
        passwordLabel: "كلمة مرور موظف البوابة الدائمة",
        namePlaceholder: "اسم موظف البوابة إلزامي",
        emailPlaceholder: "بريد موظف البوابة إلزامي",
        disabled: "تعطيل",
        enabled: "تفعيل",
      }
    : {
        title: "الكاشير",
        subtitle:
          copy.kind === "restaurant"
            ? "إدارة الكاشير وتأكيد الطلبات والمكافآت"
            : "إدارة الكاشير وتأكيد الطلبات والمكافآت",
        addTitle: "إضافة كاشير",
        addButton: "إضافة كاشير",
        openConsole: "فتح لوحة الكاشير",
        scanLoyalty: "احتساب عملية شراء",
        scanReward: "صرف مكافأة",
        scanTicket: "مسح QR الحجز",
        staffLabel: "الكاشيرات",
        passwordLabel: "كلمة مرور الكاشير الدائمة",
        namePlaceholder: "اسم الكاشير إلزامي",
        emailPlaceholder: "بريد الكاشير إلزامي",
        disabled: "تعطيل",
        enabled: "تفعيل",
      };

  const activeStaffCount = useMemo(
    () => dashboard.cashiers.filter((cashier) => cashier.active).length,
    [dashboard.cashiers],
  );

  const recentActivityCount = dashboard.activities.length;

  async function addCashier() {
    if (!cashierName.trim() || !cashierEmail.trim()) {
      setMessage(
        isEvents
          ? "اسم موظف البوابة والبريد إلزامية"
          : "اسم الكاشير والبريد إلزامية",
      );
      return;
    }

    setProcessing(true);
    setMessage("");
    try {
      const password = await createLoyaltyCashierAction({
        fullName: cashierName,
        email: cashierEmail,
        employeeNumber: employeeNumber || undefined,
      });
      setNewPassword(password);
      setMessage(isEvents ? "تم إنشاء حساب موظف البوابة" : "تم إنشاء حساب الكاشير");
      setCashierName("");
      setCashierEmail("");
      setEmployeeNumber("");
    } catch {
      setMessage(
        isEvents ? "تعذر إنشاء حساب موظف البوابة" : "تعذر إنشاء حساب الكاشير",
      );
    } finally {
      setProcessing(false);
    }
  }

  async function runLoyaltyScan(detectedCardCode?: string) {
    const rawCardCode = detectedCardCode ?? cardCode;
    if (!rawCardCode.trim()) {
      setMessage("أدخل QR بطاقة العميل");
      return;
    }

    setProcessing(true);
    setMessage("");
    try {
      const result = await recordLoyaltyCardOperationAction({
        cardCode:
          parseBarndaksaQrPayload(rawCardCode, "loyalty-card") ??
          rawCardCode.trim().toUpperCase(),
        operation: "stamp",
      });
      setMessage(
        isEvents
          ? `تم تسجيل حضور للعميل ${String(result.customerName)} وإضافة زيارة في بطاقة الولاء`
          : `تم احتساب عملية شراء للعميل ${String(result.customerName)} وإضافة ختم في بطاقة الولاء`,
      );
      setCardCode("");
    } catch {
      setMessage(
        isEvents
          ? "تعذر تسجيل الحضور من بطاقة الولاء"
          : "تعذر احتساب عملية الشراء من بطاقة الولاء",
      );
    } finally {
      setProcessing(false);
    }
  }

  async function runRewardScan(detectedRewardCode?: string) {
    const rawRewardCode = detectedRewardCode ?? rewardCode;
    if (!rawRewardCode.trim()) {
      setMessage(isEvents ? "أدخل QR مكافأة الحضور" : "أدخل QR المكافأة");
      return;
    }

    setProcessing(true);
    setMessage("");
    try {
      const result = await ownerOperationalRedeemExperienceRewardAction(rawRewardCode);
      setMessage(
        isEvents
          ? `تم صرف مكافأة الحضور للعميل ${result.customerName}`
          : `تم صرف المكافأة للعميل ${result.customerName}`,
      );
      setRewardCode("");
    } catch {
      setMessage(
        isEvents
          ? "QR مكافأة الحضور غير صالح أو مستخدم مسبقًا"
          : "QR المكافأة غير صالح أو مستخدم مسبقًا",
      );
    } finally {
      setProcessing(false);
    }
  }

  async function toggleCashier(cashierId: string, active: boolean) {
    await setLoyaltyCashierStatusAction(cashierId, active);
    setDashboard((current) => ({
      ...current,
      cashiers: current.cashiers.map((cashier) =>
        cashier.id === cashierId ? { ...cashier, active } : cashier,
      ),
    }));
  }

  return (
    <DashboardPageShell
      title={labels.title}
      subtitle={labels.subtitle}
      action={
        <Link
          href="/cashier/login"
          target="_blank"
          className="inline-flex items-center gap-2 rounded-2xl bg-[#6B3A25] px-5 py-3 text-sm font-black text-white"
        >
          <DoorOpen className="h-4 w-4" />
          {labels.openConsole}
        </Link>
      }
    >
      {configError ? (
        <SoftCard className="mb-6 p-4 font-black text-amber-700">
          {configError}
        </SoftCard>
      ) : null}
      {message ? (
        <SoftCard className="mb-6 p-4 font-black text-[#6B3A25]">
          {message}
        </SoftCard>
      ) : null}
      {newPassword ? (
        <SoftCard className="mb-6 p-4 font-black text-emerald-700">
          {labels.passwordLabel} {newPassword}
        </SoftCard>
      ) : null}

      <BentoGrid className="mb-6">
        <BentoCard variant="white">
          <UserRound className="mb-4 h-7 w-7 text-[#6B3A25]" />
          <StatPill
            label={labels.staffLabel}
            value={dashboard.cashiers.length}
            hint="حسابات تشغيل محدودة الصلاحية"
          />
        </BentoCard>
        <BentoCard variant="white">
          <BadgeCheck className="mb-4 h-7 w-7 text-[#6B3A25]" />
          <StatPill label="النشطون" value={activeStaffCount} hint="جاهزون للدخول" />
        </BentoCard>
        <BentoCard variant="white">
          <ClipboardCheck className="mb-4 h-7 w-7 text-[#6B3A25]" />
          <StatPill
            label={isEvents ? "حركة البوابة" : "حركة الكاشير"}
            value={recentActivityCount}
            hint="آخر العمليات"
          />
        </BentoCard>
        <BentoCard variant="white">
          <LockKeyhole className="mb-4 h-7 w-7 text-[#6B3A25]" />
          <StatPill
            label="الصلاحيات"
            value="تشغيل"
            hint={isEvents ? "دخول ومسح QR" : "طلبات ومكافآت"}
          />
        </BentoCard>
      </BentoGrid>

      <BentoGrid className="mb-6">
        <BentoCard variant="white" span="2">
          <h2 className="flex items-center gap-2 text-xl font-black text-[#311912]">
            <KeyRound className="h-6 w-6 text-[#6B3A25]" />
            {labels.addTitle}
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <NeumoInput
              placeholder={labels.namePlaceholder}
              value={cashierName}
              onChange={(event) => setCashierName(event.target.value)}
            />
            <NeumoInput
              type="email"
              placeholder={labels.emailPlaceholder}
              value={cashierEmail}
              onChange={(event) => setCashierEmail(event.target.value)}
            />
            <NeumoInput
              placeholder="الرقم الوظيفي اختياري"
              value={employeeNumber}
              onChange={(event) => setEmployeeNumber(event.target.value)}
            />
          </div>
          <PrimaryButton className="mt-5" onClick={addCashier} disabled={processing}>
            <Plus className="h-4 w-4" />
            {labels.addButton}
          </PrimaryButton>
          <p className="mt-3 text-xs font-bold leading-6 text-[#806A5E]">
            صلاحيات هذا الحساب تشغيلية فقط: فتح اللوحة، مسح QR، وتأكيد العمليات
            المتاحة للعلامة حسب نوع النشاط.
          </p>
        </BentoCard>

        <BentoCard variant="white" span="2">
          <h2 className="flex items-center gap-2 text-xl font-black text-[#311912]">
            <QrCode className="h-6 w-6 text-[#6B3A25]" />
            رابط الدخول
          </h2>
          <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">
            استخدم هذا الرابط على جهاز نقطة التشغيل، ثم ادخل ببريد الموظف وكلمة
            المرور الصادرة له.
          </p>
          <Link
            href="/cashier/login"
            target="_blank"
            className="mt-5 inline-flex rounded-2xl bg-[#F8F4EF] px-5 py-4 font-black text-[#6B3A25]"
          >
            {labels.openConsole}
          </Link>
        </BentoCard>
      </BentoGrid>

      <BentoGrid className="mb-6">
        <BentoCard variant="white" span="2">
          <h2 className="flex items-center gap-2 text-xl font-black text-[#311912]">
            <ScanLine className="h-6 w-6 text-[#6B3A25]" />
            قراءة QR بطاقة الولاء
          </h2>
          <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">
            {isEvents
              ? "اقرأ QR بطاقة العميل لتسجيل حضور ولاء وإضافة زيارة مباشرة."
              : "اقرأ QR بطاقة العميل لتأكيد عملية شراء وإضافة ختم مباشرة."}
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
            <NeumoInput
              placeholder="QR بطاقة العميل أو الكود"
              value={cardCode}
              onChange={(event) => setCardCode(event.target.value.toUpperCase())}
            />
            <PrimaryButton onClick={() => runLoyaltyScan()} disabled={processing}>
              <BadgeCheck className="h-4 w-4" />
              {labels.scanLoyalty}
            </PrimaryButton>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <BarcodeCameraScanner
              label="قراءة QR بطاقة العميل"
              expectedKind="loyalty-card"
              onDetected={(value) => {
                setCardCode(value.toUpperCase());
                void runLoyaltyScan(value);
              }}
            />
          </div>
        </BentoCard>

        <BentoCard variant="white" span="2">
          <h2 className="flex items-center gap-2 text-xl font-black text-[#311912]">
            <Gift className="h-6 w-6 text-[#6B3A25]" />
            {isEvents ? "QR مكافآت الحضور" : "QR المكافآت"}
          </h2>
          <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">
            اقرأ QR المكافأة بعد اعتمادها، وبعد الصرف يتوقف الكود ولا يمكن
            استخدامه مرة ثانية.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
            <NeumoInput
              placeholder={isEvents ? "QR مكافأة الحضور أو الكود" : "QR المكافأة أو الكود"}
              value={rewardCode}
              onChange={(event) => setRewardCode(event.target.value)}
            />
            <PrimaryButton onClick={() => runRewardScan()} disabled={processing}>
              <BadgeCheck className="h-4 w-4" />
              {labels.scanReward}
            </PrimaryButton>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <BarcodeCameraScanner
              label={isEvents ? "قراءة QR مكافأة الحضور" : "قراءة QR المكافأة"}
              expectedKind="experience-reward"
              onDetected={(value) => {
                setRewardCode(value);
                void runRewardScan(value);
              }}
            />
          </div>
        </BentoCard>
      </BentoGrid>

      {isEvents ? (
        <SoftCard className="mb-6 p-5">
          <h2 className="flex items-center gap-2 text-xl font-black text-[#311912]">
            <DoorOpen className="h-6 w-6 text-[#6B3A25]" />
            مسح تذكرة
          </h2>
          <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">
            مسح QR التذاكر وتأكيد الدخول يتم من واجهة بوابة الدخول المخصصة
            للموظفين حتى تسجل العملية باسم موظف البوابة.
          </p>
          <Link
            href="/cashier/login"
            target="_blank"
            className="mt-4 inline-flex rounded-2xl bg-[#6B3A25] px-5 py-3 font-black text-white"
          >
            {labels.scanTicket}
          </Link>
        </SoftCard>
      ) : null}

      <BentoGrid>
        <BentoCard variant="white" span="2">
          <h2 className="text-xl font-black text-[#311912]">
            قائمة {labels.staffLabel}
          </h2>
          <div className="mt-5 space-y-3">
            {dashboard.cashiers.map((cashier) => (
              <SoftCard key={cashier.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-[#311912]">{cashier.fullName}</p>
                    <p className="text-xs font-bold text-[#806A5E]">{cashier.email}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${
                      cashier.active
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-[#F2E7D9] text-[#806A5E]"
                    }`}
                  >
                    {cashier.active ? "نشط" : "معطل"}
                  </span>
                  <div className="rounded-xl bg-[#F8F4EF] px-3 py-2 font-mono text-sm font-black text-[#6B3A25]">
                    {cashier.temporaryPassword}
                  </div>
                  <button
                    type="button"
                    className="rounded-xl bg-[#F8F4EF] px-3 py-2 text-xs font-black text-[#6B3A25]"
                    onClick={() => void toggleCashier(cashier.id, !cashier.active)}
                  >
                    {cashier.active ? labels.disabled : labels.enabled}
                  </button>
                </div>
                <p className="mt-2 text-xs font-bold text-[#806A5E]">
                  رقم وظيفي {cashier.employeeNumber || "-"} آخر دخول{" "}
                  {cashier.lastLoginAt || "-"}
                </p>
              </SoftCard>
            ))}
            {!dashboard.cashiers.length ? (
              <p className="rounded-2xl border border-dashed border-[#E7D7C6] p-6 text-center font-bold text-[#806A5E]">
                لا توجد حسابات تشغيل بعد.
              </p>
            ) : null}
          </div>
        </BentoCard>

        <BentoCard variant="white" span="2">
          <h2 className="text-xl font-black text-[#311912]">
            {isEvents ? "حركة بوابة الدخول" : "حركة الكاشير"}
          </h2>
          <div className="mt-5 space-y-3">
            {dashboard.activities.map((activity) => (
              <SoftCard key={activity.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-black text-[#311912]">{activity.cashierName}</p>
                  <span className="rounded-full bg-[#F8F4EF] px-3 py-1 text-xs font-black text-[#6B3A25]">
                    {activity.actionType}
                  </span>
                </div>
                <p className="mt-2 text-xs font-bold text-[#806A5E]">
                  {activity.createdAt}
                </p>
                <p className="mt-1 text-sm font-bold text-[#806A5E]">
                  الهدف {activity.targetType || "-"} مرجع العملية{" "}
                  {activity.invoiceBarcode || "-"}
                </p>
                <pre className="mt-3 max-h-28 overflow-auto rounded-xl bg-[#17100d] p-3 text-left text-xs text-[#FCF8F3]">
                  {JSON.stringify(activity.details, null, 2)}
                </pre>
              </SoftCard>
            ))}
            {!dashboard.activities.length ? (
              <p className="rounded-2xl border border-dashed border-[#E7D7C6] p-6 text-center font-bold text-[#806A5E]">
                لا توجد عمليات تشغيل حديثة.
              </p>
            ) : null}
          </div>
        </BentoCard>
      </BentoGrid>
    </DashboardPageShell>
  );
}
