import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import {
  BARNDAKSA_OWNERS,
  VALUATION_METHODS,
  calculateSubscriptionSplit,
  netOfVat,
  roundMoney,
  vatFromInclusive,
} from "@/lib/finance/barndaksa-finance";

export type FinanceTransaction = {
  id: string;
  cafeId: string;
  cafeName: string;
  cafeCreatedAt: string;
  platformAgeDays: number;
  planName: string;
  status: string;
  grossAmount: number;
  netAmount: number;
  vatAmount: number;
  startedAt?: string;
  expiresAt?: string;
  createdAt: string;
  remainingDays: number | null;
  renewalsCount: number;
  couponCode?: string;
  representativeName?: string;
  representativeAmount: number;
  platformCapitalReserveAmount: number;
  ownerAmountEach: number;
};

export type FinanceCafeSummary = {
  cafeId: string;
  cafeName: string;
  createdAt: string;
  platformAgeDays: number;
  activePlanName: string;
  activePlanRemainingDays: number | null;
  renewalsCount: number;
  totalPaidSubscriptions: number;
  totalGrossAmount: number;
  registeredWithoutRepresentativeCoupon: boolean;
};

export type FinanceRepresentativeSummary = {
  representativeId: string;
  representativeName: string;
  couponCode: string;
  paidBrandsCount: number;
  totalSubscriptionBase: number;
  totalCommission: number;
};

export type BarndaksaFinanceDashboard = {
  generatedAt: string;
  currentMarketValue: number;
  owners: typeof BARNDAKSA_OWNERS;
  valuationMethods: typeof VALUATION_METHODS;
  summary: {
    paidTransactionsCount: number;
    activeSubscriptionsCount: number;
    totalGrossSubscriptions: number;
    totalNetSubscriptions: number;
    totalVatAmount: number;
    totalRepresentativeCommissions: number;
    totalPlatformCapitalReserve: number;
    totalOwnersDistributions: number;
    cafesWithoutRepresentativeCoupon: number;
  };
  transactions: FinanceTransaction[];
  cafes: FinanceCafeSummary[];
  representatives: FinanceRepresentativeSummary[];
};

function daysBetween(from?: string | null, to = new Date()) {
  if (!from) return 0;
  const start = new Date(from).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((to.getTime() - start) / 86400000));
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const target = new Date(value).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.max(0, Math.ceil((target - Date.now()) / 86400000));
}

function monthsBetween(from?: string | null, to?: string | null) {
  if (!from) return null;
  const start = new Date(from);
  const end = to ? new Date(to) : new Date();
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
  return Math.max(
    0,
    (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth()
  );
}

export async function getAdminFinanceDashboard(): Promise<BarndaksaFinanceDashboard> {
  await requirePlatformAdmin();
  const admin = createAdminClient();

  const [subscriptionsRes, cafesRes, referralsRes, representativesRes, commissionsRes] = await Promise.all([
    admin
      .from("subscriptions")
      .select("id,cafe_id,plan_id,status,amount_sar,plan_name_snapshot,started_at,expires_at,created_at,coupon_code_snapshot,discount_amount_sar,representative_id,platform_plans(name)")
      .gt("amount_sar", 0)
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("cafes")
      .select("id,name,slug,created_at,referral_coupon_id")
      .is("deleted_at", null)
      .limit(1000),
    admin
      .from("brand_referrals")
      .select("id,cafe_id,representative_id,coupon_id,registered_at,first_paid_subscription_at,commission_end_at,representative_coupons(code),platform_representatives(full_name)")
      .limit(1000),
    admin
      .from("platform_representatives")
      .select("id,full_name,representative_coupons(code),brand_referrals(cafe_id, first_paid_subscription_at),representative_commissions(base_amount_sar,amount_sar,status)")
      .limit(500),
    admin
      .from("representative_commissions")
      .select("subscription_id,amount_sar,base_amount_sar,rate_percent,status,platform_representatives(full_name)")
      .neq("status", "cancelled")
      .limit(1000),
  ]);

  if (subscriptionsRes.error) throw subscriptionsRes.error;
  if (cafesRes.error) throw cafesRes.error;
  if (referralsRes.error) throw referralsRes.error;
  if (representativesRes.error) throw representativesRes.error;
  if (commissionsRes.error) throw commissionsRes.error;

  const cafes = new Map<string, Record<string, unknown>>(
    (cafesRes.data ?? []).map((cafe) => [String(cafe.id), cafe as Record<string, unknown>])
  );
  const referralByCafe = new Map<string, Record<string, unknown>>(
    (referralsRes.data ?? []).map((referral) => [String(referral.cafe_id), referral as Record<string, unknown>])
  );
  const commissionBySubscription = new Map<string, Record<string, unknown>>();
  (commissionsRes.data ?? []).forEach((commission) => {
    if (commission.subscription_id) {
      commissionBySubscription.set(String(commission.subscription_id), commission as Record<string, unknown>);
    }
  });

  const paidSubscriptions = (subscriptionsRes.data ?? []).filter((sub) =>
    ["active", "trialing", "paid"].includes(String(sub.status))
  );
  const renewalCountByCafe = new Map<string, number>();
  paidSubscriptions.forEach((subscription) => {
    const cafeId = String(subscription.cafe_id);
    renewalCountByCafe.set(cafeId, (renewalCountByCafe.get(cafeId) ?? 0) + 1);
  });

  const transactions: FinanceTransaction[] = paidSubscriptions.map((subscription) => {
    const cafe = cafes.get(String(subscription.cafe_id));
    const referral = referralByCafe.get(String(subscription.cafe_id));
    const commission = commissionBySubscription.get(String(subscription.id));
    const plan = subscription.platform_plans as { name?: string } | null;
    const grossAmount = Number(subscription.amount_sar ?? 0);
    const monthsFromFirstPaid = monthsBetween(
      referral?.first_paid_subscription_at ? String(referral.first_paid_subscription_at) : subscription.started_at,
      subscription.started_at ?? subscription.created_at
    );
    const split = calculateSubscriptionSplit({
      grossAmount,
      hasRepresentativeCoupon: Boolean(referral),
      monthsFromFirstPaid,
    });

    return {
      id: String(subscription.id),
      cafeId: String(subscription.cafe_id),
      cafeName: String(cafe?.name ?? "علامة غير معروفة"),
      cafeCreatedAt: String(cafe?.created_at ?? subscription.created_at),
      platformAgeDays: daysBetween(String(cafe?.created_at ?? subscription.created_at)),
      planName: String(subscription.plan_name_snapshot ?? plan?.name ?? subscription.plan_id),
      status: String(subscription.status),
      grossAmount,
      netAmount: split.netAmount,
      vatAmount: split.vatAmount,
      startedAt: subscription.started_at ? String(subscription.started_at) : undefined,
      expiresAt: subscription.expires_at ? String(subscription.expires_at) : undefined,
      createdAt: String(subscription.created_at),
      remainingDays: daysUntil(subscription.expires_at ? String(subscription.expires_at) : undefined),
      renewalsCount: Math.max(0, (renewalCountByCafe.get(String(subscription.cafe_id)) ?? 1) - 1),
      couponCode: String(subscription.coupon_code_snapshot ?? (referral?.representative_coupons as { code?: string } | null)?.code ?? "") || undefined,
      representativeName: String((commission?.platform_representatives as { full_name?: string } | null)?.full_name ?? (referral?.platform_representatives as { full_name?: string } | null)?.full_name ?? "") || undefined,
      representativeAmount: Number(commission?.amount_sar ?? split.representativeAmount ?? 0),
      platformCapitalReserveAmount: split.platformCapitalReserveAmount,
      ownerAmountEach: split.ownerAmountEach,
    };
  });

  const cafeSummaries: FinanceCafeSummary[] = Array.from(cafes.values()).map((cafe) => {
    const cafeId = String(cafe.id);
    const cafeSubs = paidSubscriptions
      .filter((sub) => String(sub.cafe_id) === cafeId)
      .sort((a, b) => new Date(String(b.started_at ?? b.created_at)).getTime() - new Date(String(a.started_at ?? a.created_at)).getTime());
    const active = cafeSubs.find((sub) => ["active", "trialing"].includes(String(sub.status))) ?? cafeSubs[0];
    const plan = active?.platform_plans as { name?: string } | null;
    return {
      cafeId,
      cafeName: String(cafe.name),
      createdAt: String(cafe.created_at),
      platformAgeDays: daysBetween(String(cafe.created_at)),
      activePlanName: active ? String(active.plan_name_snapshot ?? plan?.name ?? active.plan_id) : "بدون اشتراك مدفوع",
      activePlanRemainingDays: active ? daysUntil(active.expires_at ? String(active.expires_at) : undefined) : null,
      renewalsCount: Math.max(0, cafeSubs.length - 1),
      totalPaidSubscriptions: cafeSubs.length,
      totalGrossAmount: roundMoney(cafeSubs.reduce((sum, sub) => sum + Number(sub.amount_sar ?? 0), 0)),
      registeredWithoutRepresentativeCoupon: !referralByCafe.has(cafeId),
    };
  });

  const representatives: FinanceRepresentativeSummary[] = (representativesRes.data ?? []).map((representative) => {
    const coupons = representative.representative_coupons as Array<Record<string, unknown>> | null;
    const referrals = representative.brand_referrals as Array<Record<string, unknown>> | null;
    const commissions = representative.representative_commissions as Array<Record<string, unknown>> | null;
    return {
      representativeId: String(representative.id),
      representativeName: String(representative.full_name),
      couponCode: String(coupons?.[0]?.code ?? ""),
      paidBrandsCount: referrals?.filter((item) => Boolean(item.first_paid_subscription_at)).length ?? 0,
      totalSubscriptionBase: roundMoney((commissions ?? []).filter((item) => item.status !== "cancelled").reduce((sum, item) => sum + Number(item.base_amount_sar ?? 0), 0)),
      totalCommission: roundMoney((commissions ?? []).filter((item) => item.status !== "cancelled").reduce((sum, item) => sum + Number(item.amount_sar ?? 0), 0)),
    };
  });

  const totalGrossSubscriptions = roundMoney(transactions.reduce((sum, item) => sum + item.grossAmount, 0));
  const totalNetSubscriptions = netOfVat(totalGrossSubscriptions);
  const activeSubscriptionsCount = paidSubscriptions.filter((sub) => String(sub.status) === "active").length;
  const monthlyRunRate = transactions
    .filter((item) => item.startedAt && daysBetween(item.startedAt) <= 90)
    .reduce((sum, item) => sum + item.netAmount, 0) / 3;
  const arr = Math.max(monthlyRunRate * 12, totalNetSubscriptions);
  const currentMarketValue = roundMoney(Math.max(250000, arr * 5));

  return {
    generatedAt: new Date().toISOString(),
    currentMarketValue,
    owners: BARNDAKSA_OWNERS,
    valuationMethods: VALUATION_METHODS,
    summary: {
      paidTransactionsCount: transactions.length,
      activeSubscriptionsCount,
      totalGrossSubscriptions,
      totalNetSubscriptions,
      totalVatAmount: vatFromInclusive(totalGrossSubscriptions),
      totalRepresentativeCommissions: roundMoney(transactions.reduce((sum, item) => sum + item.representativeAmount, 0)),
      totalPlatformCapitalReserve: roundMoney(transactions.reduce((sum, item) => sum + item.platformCapitalReserveAmount, 0)),
      totalOwnersDistributions: roundMoney(transactions.reduce((sum, item) => sum + item.ownerAmountEach * 4, 0)),
      cafesWithoutRepresentativeCoupon: cafeSummaries.filter((item) => item.registeredWithoutRepresentativeCoupon).length,
    },
    transactions,
    cafes: cafeSummaries,
    representatives,
  };
}
