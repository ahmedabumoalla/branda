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
import type { MenuProduct } from "@/lib/mock/menu";
import type { LoyaltyCardsDashboard } from "@/lib/data/loyalty-cards";

type Props = {
  initialDashboard: LoyaltyCardsDashboard;
  products: MenuProduct[];
  configError?: string;
};

export function LoyaltyCardsPageClient({ initialDashboard, products, configError }: Props) {
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
  const [invoiceBarcode, setInvoiceBarcode] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [operation, setOperation] = useState<"stamp" | "redeem">("stamp");

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
      setMessage("طھظ… ط­ظپط¸ ط¥ط¹ط¯ط§ط¯ط§طھ ط¨ط·ط§ظ‚ط© ط§ظ„ظˆظ„ط§ط،");
    } catch {
      setMessage("طھط¹ط°ط± ط­ظپط¸ ط¥ط¹ط¯ط§ط¯ط§طھ ط¨ط·ط§ظ‚ط© ط§ظ„ظˆظ„ط§ط،");
    } finally {
      setSaving(false);
    }
  }

  async function addCashier() {
    if (!cashierName.trim() || !cashierEmail.trim()) {
      setMessage("ط§ط³ظ… ط§ظ„ظƒط§ط´ظٹط± ظˆط§ظ„ط¨ط±ظٹط¯ ط¥ظ„ط²ط§ظ…ظٹط©");
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
      setMessage("طھظ… ط¥ظ†ط´ط§ط، ط­ط³ط§ط¨ ط§ظ„ظƒط§ط´ظٹط±");
      setCashierName("");
      setCashierEmail("");
      setEmployeeNumber("");
    } catch {
      setMessage("طھط¹ط°ط± ط¥ظ†ط´ط§ط، ط­ط³ط§ط¨ ط§ظ„ظƒط§ط´ظٹط±");
    } finally {
      setProcessing(false);
    }
  }

  async function runScan() {
    if (!cardCode.trim() || !invoiceBarcode.trim()) {
      setMessage("ط£ط¯ط®ظ„ ط¨ط§ط±ظƒظˆط¯ ط§ظ„ط¨ط·ط§ظ‚ط© ظˆط¨ط§ط±ظƒظˆط¯ ط§ظ„ظپط§طھظˆط±ط©");
      return;
    }

    setProcessing(true);
    setMessage("");
    try {
      const result = await recordLoyaltyCardOperationAction({
        cardCode,
        invoiceBarcode,
        invoiceAmount: Number(invoiceAmount || 0),
        operation,
      });
      setMessage(operation === "stamp" ? `طھظ… طھط£ظƒظٹط¯ ط§ظ„ط¹ظ…ظ„ظٹط© ظ„ظ„ط¹ظ…ظٹظ„ ${String(result.customerName)}` : `طھظ… طµط±ظپ ط§ظ„ظ…ظƒط§ظپط£ط© ظ„ظ„ط¹ظ…ظٹظ„ ${String(result.customerName)}`);
      setCardCode("");
      setInvoiceBarcode("");
      setInvoiceAmount("");
    } catch {
      setMessage(operation === "stamp" ? "طھط¹ط°ط± طھط£ظƒظٹط¯ ط§ظ„ط®طھظ… ط£ظˆ ط§ظ„ط¹ظ…ظ„ظٹط©" : "طھط¹ط°ط± طµط±ظپ ط§ظ„ظ…ظƒط§ظپط£ط©");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <DashboardPageShell
      title="ط¨ط·ط§ظ‚ط§طھ ط§ظ„ظˆظ„ط§ط،"
      subtitle="ظ…ظ†ط¸ظˆظ…ط© ط¨ط·ط§ظ‚ط© ط§ظ„ط¹ظ„ط§ظ…ط© ظˆط§ظ„ظƒط§ط´ظٹط± ظˆط§ظ„ط¨ط§ط±ظƒظˆط¯ ظˆط³ط¬ظ„ ط§ظ„ط¹ظ…ظ„ظٹط§طھ"
      action={<a href="#cashier-tracking" className="rounded-2xl bg-[#6B3A25] px-5 py-3 text-sm font-black text-white">ظ…طھط§ط¨ط¹ط© ط§ظ„ظƒط§ط´ظٹط±</a>}
    >
      {configError ? <SoftCard className="mb-6 p-4 font-black text-amber-700">{configError}</SoftCard> : null}
      {message ? <SoftCard className="mb-6 p-4 font-black text-[#6B3A25]">{message}</SoftCard> : null}
      {newPassword ? <SoftCard className="mb-6 p-4 font-black text-emerald-700">ظƒظ„ظ…ط© ظ…ط±ظˆط± ط§ظ„ظƒط§ط´ظٹط± ط§ظ„ط¯ط§ط¦ظ…ط© {newPassword}</SoftCard> : null}

      <BentoGrid className="mb-6">
        <BentoCard variant="white"><CreditCard className="mb-4 h-7 w-7 text-[#6B3A25]" /><StatPill label="ط¨ط·ط§ظ‚ط§طھ ط§ظ„ط¹ظ…ظ„ط§ط،" value={dashboard.cards.length} hint="ط¯ط§ط®ظ„ ظ‡ط°ظ‡ ط§ظ„ط¹ظ„ط§ظ…ط©" /></BentoCard>
        <BentoCard variant="white"><ShoppingBag className="mb-4 h-7 w-7 text-[#6B3A25]" /><StatPill label="ط¹ظ…ظ„ظٹط§طھ ط§ظ„ط´ط±ط§ط،" value={totalPurchases} hint="ظ…ط¤ظƒط¯ط© ط¨ط§ظ„ط¨ط§ط±ظƒظˆط¯" /></BentoCard>
        <BentoCard variant="white"><Gift className="mb-4 h-7 w-7 text-[#6B3A25]" /><StatPill label="ظ…ظƒط§ظپط¢طھ ظ…طھط§ط­ط©" value={activeRewards} hint="ط¬ط§ظ‡ط²ط© ظ„ظ„طµط±ظپ" /></BentoCard>
        <BentoCard variant="white"><UserRound className="mb-4 h-7 w-7 text-[#6B3A25]" /><StatPill label="ط§ظ„ظƒط§ط´ظٹط±ط§طھ" value={dashboard.cashiers.length} hint="ط­ط³ط§ط¨ط§طھ طھط´ط؛ظٹظ„ ظ…ط­ط¯ظˆط¯ط©" /></BentoCard>
      </BentoGrid>

      <BentoGrid className="mb-6">
        <BentoCard variant="white" span="2">
          <h2 className="text-xl font-black text-[#311912]">ط¥ط¹ط¯ط§ط¯ ط¨ط·ط§ظ‚ط© ط§ظ„ظˆظ„ط§ط،</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="space-y-2"><span className="text-sm font-black text-[#6B3A25]">ط§ظ„ط­ط§ظ„ط©</span><NeumoSelect value={enabled ? "on" : "off"} onChange={(e) => setEnabled(e.target.value === "on")}><option value="on">ظ…ظپط¹ظ„</option><option value="off">ظ…ظˆظ‚ظˆظپ</option></NeumoSelect></label>
            <label className="space-y-2"><span className="text-sm font-black text-[#6B3A25]">ط¹ط¯ط¯ ط§ظ„ط¹ظ…ظ„ظٹط§طھ ظ„ظ„ظ…ظƒط§ظپط£ط©</span><NeumoInput type="number" value={purchasesRequired} onChange={(e) => setPurchasesRequired(e.target.value)} /></label>
            <label className="space-y-2"><span className="text-sm font-black text-[#6B3A25]">ط¹ظ†ظˆط§ظ† ط§ظ„ط¨ط·ط§ظ‚ط©</span><NeumoInput value={cardTitle} onChange={(e) => setCardTitle(e.target.value)} /></label>
            <label className="space-y-2"><span className="text-sm font-black text-[#6B3A25]">ظˆطµظپ ط§ظ„ط¨ط·ط§ظ‚ط©</span><NeumoInput value={cardSubtitle} onChange={(e) => setCardSubtitle(e.target.value)} /></label>
            <label className="space-y-2"><span className="text-sm font-black text-[#6B3A25]">ط§ظ„ظ…ظ†طھط¬ ط§ظ„ظ…ط¬ط§ظ†ظٹ</span><NeumoSelect value={rewardProductId} onChange={(e) => setRewardProductId(e.target.value)}><option value="">ط¨ط¯ظˆظ† ط±ط¨ط· ظ…ظ†طھط¬</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</NeumoSelect></label>
            <label className="space-y-2"><span className="text-sm font-black text-[#6B3A25]">ط§ط³ظ… ط§ظ„ظ…ظƒط§ظپط£ط©</span><NeumoInput value={rewardName} onChange={(e) => setRewardName(e.target.value)} /></label>
            <label className="space-y-2"><span className="text-sm font-black text-[#6B3A25]">ظ„ظˆظ† ط§ظ„ط¨ط·ط§ظ‚ط©</span><NeumoInput value={cardBackground} onChange={(e) => setCardBackground(e.target.value)} /></label>
            <label className="space-y-2"><span className="text-sm font-black text-[#6B3A25]">ظ„ظˆظ† ط§ظ„طھظ…ظٹظٹط²</span><NeumoInput value={cardAccent} onChange={(e) => setCardAccent(e.target.value)} /></label>
            <label className="space-y-2 sm:col-span-2"><span className="text-sm font-black text-[#6B3A25]">ط§ظ„ط´ط±ظˆط·</span><NeumoTextarea value={terms} onChange={(e) => setTerms(e.target.value)} /></label>
          </div>
          <PrimaryButton className="mt-5" onClick={saveProgram} disabled={saving}><Save className="h-4 w-4" />{saving ? "ط¬ط§ط±ظٹ ط§ظ„ط­ظپط¸" : "ط­ظپط¸ ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ط¨ط·ط§ظ‚ط©"}</PrimaryButton>
        </BentoCard>

        <BentoCard variant="gold" span="2">
          <div className="rounded-[30px] p-6" style={{ background: cardBackground, color: cardForeground }}>
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-sm font-black opacity-80">{dashboard.cafeName}</p><h3 className="mt-2 text-3xl font-black">{cardTitle}</h3><p className="mt-2 text-sm font-bold opacity-80">{cardSubtitle}</p></div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: cardAccent, color: cardBackground }}><WalletCards className="h-8 w-8" /></div>
            </div>
            <div className="mt-8 rounded-2xl bg-white p-4 text-center text-[#17100d]">
              <p className="font-mono text-xl font-black tracking-[0.3em]">BRANDA-CARD</p>
              <div className="mt-3 grid grid-cols-12 gap-1">{Array.from({ length: 36 }).map((_, index) => <span key={index} className="h-10 rounded-sm bg-[#17100d]" style={{ opacity: index % 3 === 0 ? 1 : 0.55 }} />)}</div>
            </div>
          </div>
        </BentoCard>
      </BentoGrid>

      <BentoGrid className="mb-6">
        <BentoCard variant="white" span="2">
          <h2 className="flex items-center gap-2 text-xl font-black text-[#311912]"><ScanLine className="h-6 w-6 text-[#6B3A25]" />ظ‚ط§ط±ط¦ ط§ظ„ط¨ط·ط§ظ‚ط© ظˆط§ظ„ظپط§طھظˆط±ط©</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <NeumoInput placeholder="ط¨ط§ط±ظƒظˆط¯ ط¨ط·ط§ظ‚ط© ط§ظ„ط¹ظ…ظٹظ„" value={cardCode} onChange={(e) => setCardCode(e.target.value.toUpperCase())} />
            <NeumoInput placeholder="ط¨ط§ط±ظƒظˆط¯ ط§ظ„ظپط§طھظˆط±ط©" value={invoiceBarcode} onChange={(e) => setInvoiceBarcode(e.target.value)} />
            <NeumoInput type="number" placeholder="ظ‚ظٹظ…ط© ط§ظ„ظپط§طھظˆط±ط© ط§ط®طھظٹط§ط±ظٹ" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} />
            <NeumoSelect value={operation} onChange={(e) => setOperation(e.target.value as "stamp" | "redeem")}><option value="stamp">طھط£ظƒظٹط¯ ط®طھظ… ط£ظˆ ط¹ظ…ظ„ظٹط© ط´ط±ط§ط،</option><option value="redeem">طµط±ظپ ظ…ظƒط§ظپط£ط©</option></NeumoSelect>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <BarcodeCameraScanner label="ظ‚ط±ط§ط،ط© ط¨ط·ط§ظ‚ط© ط§ظ„ط¹ظ…ظٹظ„" onDetected={(value) => setCardCode(value.toUpperCase())} />
            <BarcodeCameraScanner label="ظ‚ط±ط§ط،ط© ط¨ط§ط±ظƒظˆط¯ ط§ظ„ظپط§طھظˆط±ط©" onDetected={setInvoiceBarcode} />
            <PrimaryButton onClick={runScan} disabled={processing}><BadgeCheck className="h-4 w-4" />طھظ†ظپظٹط° ط§ظ„ط¹ظ…ظ„ظٹط©</PrimaryButton>
          </div>
        </BentoCard>

        <BentoCard variant="white" span="2">
          <h2 className="flex items-center gap-2 text-xl font-black text-[#311912]"><KeyRound className="h-6 w-6 text-[#6B3A25]" />ط¥ط¶ط§ظپط© ظƒط§ط´ظٹط±</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <NeumoInput placeholder="ط§ط³ظ… ط§ظ„ظƒط§ط´ظٹط± ط¥ظ„ط²ط§ظ…ظٹ" value={cashierName} onChange={(e) => setCashierName(e.target.value)} />
            <NeumoInput type="email" placeholder="ط¨ط±ظٹط¯ ط§ظ„ظƒط§ط´ظٹط± ط¥ظ„ط²ط§ظ…ظٹ" value={cashierEmail} onChange={(e) => setCashierEmail(e.target.value)} />
            <NeumoInput placeholder="ط§ظ„ط±ظ‚ظ… ط§ظ„ظˆط¸ظٹظپظٹ ط§ط®طھظٹط§ط±ظٹ" value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} />
          </div>
          <PrimaryButton className="mt-5" onClick={addCashier} disabled={processing}><Plus className="h-4 w-4" />ط¥ط¶ط§ظپط© ظƒط§ط´ظٹط±</PrimaryButton>
          <div className="mt-5 space-y-3">
            {dashboard.cashiers.map((cashier) => (
              <SoftCard key={cashier.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="font-black text-[#311912]">{cashier.fullName}</p><p className="text-xs font-bold text-[#806A5E]">{cashier.email}</p></div>
                  <div className="rounded-xl bg-[#F8F4EF] px-3 py-2 font-mono text-sm font-black text-[#6B3A25]">{cashier.temporaryPassword}</div>
                  <button className="rounded-xl bg-[#F8F4EF] px-3 py-2 text-xs font-black text-[#6B3A25]" onClick={async () => {
                    await setLoyaltyCashierStatusAction(cashier.id, !cashier.active);
                    setDashboard((current) => ({...current, cashiers: current.cashiers.map((item) => item.id === cashier.id ? { ...item, active: !item.active } : item)}));
                  }}>{cashier.active ? "طھط¹ط·ظٹظ„" : "طھظپط¹ظٹظ„"}</button>
                </div>
                <p className="mt-2 text-xs font-bold text-[#806A5E]">ط±ظ‚ظ… ظˆط¸ظٹظپظٹ {cashier.employeeNumber || "-"} ط¢ط®ط± ط¯ط®ظˆظ„ {cashier.lastLoginAt || "-"}</p>
              </SoftCard>
            ))}
          </div>
        </BentoCard>
      </BentoGrid>

      <div id="cashier-tracking"><BentoGrid>
        <BentoCard variant="white" span="2">
          <h2 className="text-xl font-black text-[#311912]">ط¨ط·ط§ظ‚ط§طھ ط§ظ„ط¹ظ…ظ„ط§ط،</h2>
          <div className="mt-5 space-y-3">
            {dashboard.cards.map((card) => (
              <SoftCard key={card.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="font-black text-[#311912]">{card.customerName}</p><p className="font-mono text-xs font-black text-[#6B3A25]">{card.cardCode}</p></div>
                  <div className="text-left text-sm font-black text-[#6B3A25]">{card.stampsInCycle} / {dashboard.program.purchasesRequired}</div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E7D7C6]"><div className="h-full rounded-full bg-[#D9A33F]" style={{ width: `${Math.min(100, (card.stampsInCycle / dashboard.program.purchasesRequired) * 100)}%` }} /></div>
                <p className="mt-2 text-xs font-bold text-[#806A5E]">ظ…ظƒط§ظپط¢طھ {card.availableRewards} ط¹ظ…ظ„ظٹط§طھ {card.totalPurchases}</p>
              </SoftCard>
            ))}
          </div>
        </BentoCard>

        <BentoCard variant="white" span="2">
          <h2 className="text-xl font-black text-[#311912]">ظ…طھط§ط¨ط¹ط© ط§ظ„ظƒط§ط´ظٹط± ط¨ط§ظ„طھظپطµظٹظ„</h2>
          <div className="mt-5 space-y-3">
            {dashboard.activities.map((activity) => (
              <SoftCard key={activity.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-black text-[#311912]">{activity.cashierName}</p>
                  <span className="rounded-full bg-[#F8F4EF] px-3 py-1 text-xs font-black text-[#6B3A25]">{activity.actionType}</span>
                </div>
                <p className="mt-2 text-xs font-bold text-[#806A5E]">{activity.createdAt}</p>
                <p className="mt-1 text-sm font-bold text-[#806A5E]">ط§ظ„ظ‡ط¯ظپ {activity.targetType || "-"} ط§ظ„ظپط§طھظˆط±ط© {activity.invoiceBarcode || "-"}</p>
                <pre className="mt-3 max-h-28 overflow-auto rounded-xl bg-[#17100d] p-3 text-left text-xs text-[#FCF8F3]">{JSON.stringify(activity.details, null, 2)}</pre>
              </SoftCard>
            ))}
          </div>
        </BentoCard>
      </BentoGrid></div>
    </DashboardPageShell>
  );
}

