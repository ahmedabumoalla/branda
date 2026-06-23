"use client";

import {
  BadgeCheck,
  CreditCard,
  Gift,
  KeyRound,
  Plus,
  Save,
  ScanLine,
  ShoppingBag,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  createLoyaltyCashierAction,
  recordLoyaltyCardOperationAction,
  saveLoyaltyCardProgramAction,
  setLoyaltyCashierStatusAction,
} from "@/app/actions/loyalty-cards";
import { BarcodeCameraScanner } from "@/components/loyalty/barcode-camera-scanner";
import { SecureQrCode } from "@/components/loyalty/secure-qr-code";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  NeumoInput,
  NeumoSelect,
  NeumoTextarea,
  PrimaryButton,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { formatSar } from "@/lib/format";
import { parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import type { MenuProduct } from "@/lib/mock/menu";
import type { LoyaltyCardsDashboard } from "@/lib/data/loyalty-cards";
import { getBusinessCopy } from "@/lib/platform/business-copy";

type Props = {
  initialDashboard: LoyaltyCardsDashboard;
  products: MenuProduct[];
  configError?: string;
};

export function LoyaltyCardsPageClient({ initialDashboard, products, configError }: Props) {
  const copy = getBusinessCopy(initialDashboard.businessCategory);
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [enabled, setEnabled] = useState(initialDashboard.program.enabled);
  const [cardTitle, setCardTitle] = useState(initialDashboard.program.cardTitle);
  const [cardSubtitle, setCardSubtitle] = useState(initialDashboard.program.cardSubtitle);
  const [purchasesRequired, setPurchasesRequired] = useState(String(initialDashboard.program.purchasesRequired));
  const [rewardProductId, setRewardProductId] = useState(initialDashboard.program.rewardProductId ?? "");
  const [rewardName, setRewardName] = useState(initialDashboard.program.rewardName);
  const [stampLabel, setStampLabel] = useState(initialDashboard.program.stampLabel);
  const [terms, setTerms] = useState(initialDashboard.program.terms);
  const [cardBackground, setCardBackground] = useState(initialDashboard.program.cardBackground);
  const [cardForeground, setCardForeground] = useState(initialDashboard.program.cardForeground);
  const [cardAccent, setCardAccent] = useState(initialDashboard.program.cardAccent);

  const [cashierName, setCashierName] = useState("");
  const [cashierEmail, setCashierEmail] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [cardCode, setCardCode] = useState("");

  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");

  const activeRewards = useMemo(
    () => dashboard.cards.reduce((sum, card) => sum + card.availableRewards, 0),
    [dashboard.cards]
  );

  const totalPurchases = useMemo(
    () => dashboard.cards.reduce((sum, card) => sum + card.totalPurchases, 0),
    [dashboard.cards]
  );

  async function saveProgram() {
    setSaving(true);
    setMessage("");
    try {
      await saveLoyaltyCardProgramAction({
        enabled,
        cardTitle,
        cardSubtitle,
        purchasesRequired: Number(purchasesRequired),
        rewardProductId: rewardProductId || null,
        rewardName,
        stampLabel,
        terms,
        cardBackground,
        cardForeground,
        cardAccent,
      });

      const rewardProduct = products.find((product) => product.id === rewardProductId);
      setDashboard((current) => ({
        ...current,
        program: {
          ...current.program,
          enabled,
          cardTitle,
          cardSubtitle,
          purchasesRequired: Number(purchasesRequired),
          rewardProductId: rewardProductId || null,
          rewardProductName: rewardProduct?.name ?? "",
          rewardName,
          stampLabel,
          terms,
          cardBackground,
          cardForeground,
          cardAccent,
        },
      }));
      setMessage("تم حفظ إعدادات بطاقة الولاء");
    } catch {
      setMessage("تعذر حفظ إعدادات بطاقة الولاء");
    } finally {
      setSaving(false);
    }
  }

  async function addCashier() {
    if (!cashierName.trim() || !cashierEmail.trim()) {
      setMessage("اسم الكاشير والبريد إلزامية");
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
      setMessage("تم إنشاء حساب الكاشير");
      setCashierName("");
      setCashierEmail("");
      setEmployeeNumber("");
    } catch {
      setMessage("تعذر إنشاء حساب الكاشير");
    } finally {
      setProcessing(false);
    }
  }

  async function runScan(detectedCardCode?: string) {
    const rawCardCode = detectedCardCode ?? cardCode;
    if (!rawCardCode.trim()) {
      setMessage("أدخل QR بطاقة العميل");
      return;
    }

    setProcessing(true);
    setMessage("");
    try {
      const result = await recordLoyaltyCardOperationAction({
        cardCode: parseBarndaksaQrPayload(rawCardCode, "loyalty-card") ?? rawCardCode.trim().toUpperCase(),
        operation: "stamp",
      });
      setMessage(`تم احتساب عملية شراء للعميل ${String(result.customerName)} وإضافة ختم في بطاقة الولاء`);
      setCardCode("");
    } catch {
      setMessage("تعذر احتساب عملية الشراء من بطاقة الولاء");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <DashboardPageShell
      title="بطاقات الولاء"
      subtitle="منظومة بطاقة العلامة والكاشير وQR وسجل العمليات"
      action={<a href="#cashier-tracking" className="rounded-2xl bg-[#6B3A25] px-5 py-3 text-sm font-black text-white">متابعة الكاشير</a>}
    >
      {configError ? <SoftCard className="mb-6 p-4 font-black text-amber-700">{configError}</SoftCard> : null}
      {message ? <SoftCard className="mb-6 p-4 font-black text-[#6B3A25]">{message}</SoftCard> : null}
      {newPassword ? <SoftCard className="mb-6 p-4 font-black text-emerald-700">كلمة مرور الكاشير الدائمة {newPassword}</SoftCard> : null}

      <BentoGrid className="mb-6">
        <BentoCard variant="white"><CreditCard className="mb-4 h-7 w-7 text-[#6B3A25]" /><StatPill label="بطاقات العملاء" value={dashboard.cards.length} hint="داخل هذه العلامة" /></BentoCard>
        <BentoCard variant="white"><ShoppingBag className="mb-4 h-7 w-7 text-[#6B3A25]" /><StatPill label="عمليات الشراء" value={totalPurchases} hint="مؤكدة بالـ QR" /></BentoCard>
        <BentoCard variant="white"><Gift className="mb-4 h-7 w-7 text-[#6B3A25]" /><StatPill label="مكافآت متاحة" value={activeRewards} hint="جاهزة للصرف" /></BentoCard>
        <BentoCard variant="white"><UserRound className="mb-4 h-7 w-7 text-[#6B3A25]" /><StatPill label="الكاشيرات" value={dashboard.cashiers.length} hint="حسابات تشغيل محدودة" /></BentoCard>
      </BentoGrid>

      <BentoGrid className="mb-6">
        <BentoCard variant="white" span="2">
          <h2 className="text-xl font-black text-[#311912]">إعداد بطاقة الولاء</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="space-y-2"><span className="text-sm font-black text-[#6B3A25]">الحالة</span><NeumoSelect value={enabled ? "on" : "off"} onChange={(e) => setEnabled(e.target.value === "on")}><option value="on">مفعل</option><option value="off">موقوف</option></NeumoSelect></label>
            <label className="space-y-2"><span className="text-sm font-black text-[#6B3A25]">عدد العمليات للمكافأة</span><NeumoInput type="number" value={purchasesRequired} onChange={(e) => setPurchasesRequired(e.target.value)} /></label>
            <label className="space-y-2"><span className="text-sm font-black text-[#6B3A25]">عنوان البطاقة</span><NeumoInput value={cardTitle} onChange={(e) => setCardTitle(e.target.value)} /></label>
            <label className="space-y-2"><span className="text-sm font-black text-[#6B3A25]">وصف البطاقة</span><NeumoInput value={cardSubtitle} onChange={(e) => setCardSubtitle(e.target.value)} /></label>
            <label className="space-y-2"><span className="text-sm font-black text-[#6B3A25]">{copy.kind === "restaurant" ? "الوجبة أو المنتج المجاني" : "المنتج المجاني"}</span><NeumoSelect value={rewardProductId} onChange={(e) => setRewardProductId(e.target.value)}><option value="">بدون ربط منتج</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</NeumoSelect></label>
            <label className="space-y-2"><span className="text-sm font-black text-[#6B3A25]">اسم المكافأة</span><NeumoInput value={rewardName} onChange={(e) => setRewardName(e.target.value)} /></label>
            <label className="space-y-2"><span className="text-sm font-black text-[#6B3A25]">لون البطاقة</span><NeumoInput value={cardBackground} onChange={(e) => setCardBackground(e.target.value)} /></label>
            <label className="space-y-2"><span className="text-sm font-black text-[#6B3A25]">لون التمييز</span><NeumoInput value={cardAccent} onChange={(e) => setCardAccent(e.target.value)} /></label>
            <label className="space-y-2 sm:col-span-2"><span className="text-sm font-black text-[#6B3A25]">الشروط</span><NeumoTextarea value={terms} onChange={(e) => setTerms(e.target.value)} /></label>
          </div>
          <PrimaryButton className="mt-5" onClick={saveProgram} disabled={saving}><Save className="h-4 w-4" />{saving ? "جاري الحفظ" : "حفظ إعدادات البطاقة"}</PrimaryButton>
        </BentoCard>

        <BentoCard variant="gold" span="2">
          <div className="rounded-[30px] p-6" style={{ background: cardBackground, color: cardForeground }}>
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-sm font-black opacity-80">{dashboard.cafeName}</p><h3 className="mt-2 text-3xl font-black">{cardTitle}</h3><p className="mt-2 text-sm font-bold opacity-80">{cardSubtitle}</p></div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: cardAccent, color: cardBackground }}><WalletCards className="h-8 w-8" /></div>
            </div>
            <div className="mt-8 rounded-2xl bg-white p-4 text-center text-[#17100d]">
              <p className="font-mono text-xl font-black tracking-[0.3em]">BARNDAKSA-CARD</p>
              <SecureQrCode kind="loyalty-card" value="BARNDAKSA-CARD" title="نموذج QR بطاقة الولاء" size={170} className="mt-3" />
            </div>
          </div>
        </BentoCard>
      </BentoGrid>

      <BentoGrid className="mb-6">
        <BentoCard variant="white" span="2">
          <h2 className="flex items-center gap-2 text-xl font-black text-[#311912]"><ScanLine className="h-6 w-6 text-[#6B3A25]" />قارئ QR بطاقة الولاء</h2>
          <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">اقرأ QR بطاقة العميل فقط، وسيتم احتساب عملية شراء مباشرة وإضافة ختم في بطاقة الولاء.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
            <NeumoInput placeholder="QR بطاقة العميل أو الكود" value={cardCode} onChange={(e) => setCardCode(e.target.value.toUpperCase())} />
            <PrimaryButton onClick={() => runScan()} disabled={processing}><BadgeCheck className="h-4 w-4" />احتساب عملية شراء</PrimaryButton>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <BarcodeCameraScanner label="قراءة QR بطاقة العميل" expectedKind="loyalty-card" onDetected={(value) => { setCardCode(value.toUpperCase()); void runScan(value); }} />
          </div>
        </BentoCard>

        <BentoCard variant="white" span="2">
          <h2 className="flex items-center gap-2 text-xl font-black text-[#311912]"><KeyRound className="h-6 w-6 text-[#6B3A25]" />إضافة كاشير</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <NeumoInput placeholder="اسم الكاشير إلزامي" value={cashierName} onChange={(e) => setCashierName(e.target.value)} />
            <NeumoInput type="email" placeholder="بريد الكاشير إلزامي" value={cashierEmail} onChange={(e) => setCashierEmail(e.target.value)} />
            <NeumoInput placeholder="الرقم الوظيفي اختياري" value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} />
          </div>
          <PrimaryButton className="mt-5" onClick={addCashier} disabled={processing}><Plus className="h-4 w-4" />إضافة كاشير</PrimaryButton>
          <div className="mt-5 space-y-3">
            {dashboard.cashiers.map((cashier) => (
              <SoftCard key={cashier.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="font-black text-[#311912]">{cashier.fullName}</p><p className="text-xs font-bold text-[#806A5E]">{cashier.email}</p></div>
                  <div className="rounded-xl bg-[#F8F4EF] px-3 py-2 font-mono text-sm font-black text-[#6B3A25]">{cashier.temporaryPassword}</div>
                  <button className="rounded-xl bg-[#F8F4EF] px-3 py-2 text-xs font-black text-[#6B3A25]" onClick={async () => {
                    await setLoyaltyCashierStatusAction(cashier.id, !cashier.active);
                    setDashboard((current) => ({...current, cashiers: current.cashiers.map((item) => item.id === cashier.id ? { ...item, active: !item.active } : item)}));
                  }}>{cashier.active ? "تعطيل" : "تفعيل"}</button>
                </div>
                <p className="mt-2 text-xs font-bold text-[#806A5E]">رقم وظيفي {cashier.employeeNumber || "-"} آخر دخول {cashier.lastLoginAt || "-"}</p>
              </SoftCard>
            ))}
          </div>
        </BentoCard>
      </BentoGrid>

      <div id="cashier-tracking"><BentoGrid>
        <BentoCard variant="white" span="2">
          <h2 className="text-xl font-black text-[#311912]">بطاقات العملاء</h2>
          <div className="mt-5 space-y-3">
            {dashboard.cards.map((card) => (
              <SoftCard key={card.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="font-black text-[#311912]">{card.customerName}</p><p className="font-mono text-xs font-black text-[#6B3A25]">{card.cardCode}</p></div>
                  <div className="text-left text-sm font-black text-[#6B3A25]">{card.stampsInCycle} / {dashboard.program.purchasesRequired}</div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E7D7C6]"><div className="h-full rounded-full bg-[#D9A33F]" style={{ width: `${Math.min(100, (card.stampsInCycle / dashboard.program.purchasesRequired) * 100)}%` }} /></div>
                <p className="mt-2 text-xs font-bold text-[#806A5E]">مكافآت {card.availableRewards} عمليات {card.totalPurchases}</p>
              </SoftCard>
            ))}
          </div>
        </BentoCard>

        <BentoCard variant="white" span="2">
          <h2 className="text-xl font-black text-[#311912]">متابعة الكاشير بالتفصيل</h2>
          <div className="mt-5 space-y-3">
            {dashboard.activities.map((activity) => (
              <SoftCard key={activity.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-black text-[#311912]">{activity.cashierName}</p>
                  <span className="rounded-full bg-[#F8F4EF] px-3 py-1 text-xs font-black text-[#6B3A25]">{activity.actionType}</span>
                </div>
                <p className="mt-2 text-xs font-bold text-[#806A5E]">{activity.createdAt}</p>
                <p className="mt-1 text-sm font-bold text-[#806A5E]">الهدف {activity.targetType || "-"} مرجع العملية {activity.invoiceBarcode || "-"}</p>
                <pre className="mt-3 max-h-28 overflow-auto rounded-xl bg-[#17100d] p-3 text-left text-xs text-[#FCF8F3]">{JSON.stringify(activity.details, null, 2)}</pre>
              </SoftCard>
            ))}
          </div>
        </BentoCard>
      </BentoGrid></div>
    </DashboardPageShell>
  );
}
