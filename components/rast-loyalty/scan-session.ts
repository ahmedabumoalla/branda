import type { CashierRewardPreview } from "@/lib/data/customer-rewards";
import { parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";

export type RastScanKind = "stamp" | "redeem";
export type RastCardPreview = { customerName: string; stampsInCycle: number; purchasesRequired: number; availableRewards: number; rewardName: string };
export type RastScanPreview = { kind: "stamp"; value: string; card: RastCardPreview } | { kind: "redeem"; value: string; reward: CashierRewardPreview };

type Dependencies = {
  lookupCard: (value: string) => Promise<RastCardPreview>;
  lookupReward: (value: string) => Promise<CashierRewardPreview>;
  commit: (input: { value: string; kind: RastScanKind; requestId: string }) => Promise<Record<string, unknown>>;
  createRequestId: () => string;
  now?: () => number;
};

function canonicalCode(value: string, kind: RastScanKind) {
  const code = parseBarndaksaQrPayload(value, kind === "stamp" ? "loyalty-card" : "customer-reward") ?? value.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{4,100}$/.test(code)) throw new Error("الرمز غير صالح لنوع العملية المحدد.");
  return code;
}

// This session coordinates UI requests only. Every read/mutation must still
// authorize the cashier and validate the current card/reward on the server.
export function createRastScanSession(dependencies: Dependencies) {
  let busy = false;
  let preview: RastScanPreview | null = null;
  const uncertainRequests = new Map<string, string>();
  return {
    get busy() { return busy; },
    invalidate() { if (!busy) preview = null; },
    async inspect(kind: RastScanKind, value: string): Promise<RastScanPreview | null> {
      if (busy) return null;
      preview = null;
      const code = canonicalCode(value, kind);
      busy = true;
      try {
        if (kind === "stamp") preview = { kind, value: code, card: await dependencies.lookupCard(code) };
        else {
          const reward = await dependencies.lookupReward(code);
          if (reward.sourceType !== "loyalty") throw new Error("هذا الرمز ليس مكافأة من برنامج الولاء.");
          preview = { kind, value: code, reward };
        }
        return preview;
      } finally { busy = false; }
    },
    async confirm(kind: RastScanKind, value: string): Promise<Record<string, unknown> | null> {
      if (busy) return null;
      const code = canonicalCode(value, kind);
      if (!preview || preview.kind !== kind || preview.value !== code) throw new Error("افحص الرمز وراجع بيانات العميل أولًا.");
      if (preview.kind === "redeem") {
        if (!preview.reward.canRedeem) throw new Error(preview.reward.invalidReason || "المكافأة غير متاحة للصرف.");
        if (preview.reward.expiresAt && Date.parse(preview.reward.expiresAt) <= (dependencies.now?.() ?? Date.now())) throw new Error("انتهت صلاحية المكافأة. افحصها مرة أخرى.");
      }
      const key = `${kind}:${code}`;
      const requestId = uncertainRequests.get(key) ?? dependencies.createRequestId();
      uncertainRequests.set(key, requestId);
      busy = true;
      try {
        const result = await dependencies.commit({ value: code, kind, requestId });
        // A definite response ends this attempt, including a rejected scan.
        // An interrupted response retains its id across re-scans and tab changes.
        uncertainRequests.delete(key);
        if (["stamped", "reward_issued", "redeemed"].includes(String(result.status))) preview = null;
        return result;
      } finally { busy = false; }
    },
  };
}
