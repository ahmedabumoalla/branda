"use server";

import {
  createOwnerCashier,
  getOwnerLoyaltyCardsDashboard,
  issueCurrentCustomerLoyaltyCard,
  getCurrentCustomerLoyaltyCardView,
  getLoyaltyCardViewByCode,
  getPublicLoyaltyProgramBySlug,
  recordOwnerLoyaltyOperation,
  saveOwnerLoyaltyProgram,
  setOwnerCashierStatus,
} from "@/lib/data/loyalty-cards";
import {
  getOwnerFeatureCodes,
  getPublicCafeFeatureCodesBySlug,
} from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import type { LoyaltyCardDesign } from "@/lib/loyalty/types";

async function publicLoyaltyEnabled(cafeSlug: string) {
  try {
    const features = await getPublicCafeFeatureCodesBySlug(cafeSlug);
    if (!featureCodesAllow(features, "loyalty")) return false;
    const program = await getPublicLoyaltyProgramBySlug(cafeSlug);
    return program?.enabled !== false;
  } catch (error) {
    console.warn("[loyalty-cards/public-feature-gate]", error);
    return false;
  }
}

async function assertOwnerLoyaltyEnabled() {
  const features = await getOwnerFeatureCodes();
  if (!featureCodesAllow(features, "loyalty")) {
    throw new Error("بطاقات الولاء غير مفعلة في باقتك الحالية");
  }
}

async function assertOwnerCashierEnabled() {
  const features = await getOwnerFeatureCodes();
  if (!featureCodesAllow(features, "cashier")) {
    throw new Error("خدمات التشغيل غير مفعلة في باقتك الحالية");
  }
}

export async function fetchLoyaltyCardsDashboardAction() {
  await assertOwnerLoyaltyEnabled();
  return getOwnerLoyaltyCardsDashboard();
}

export async function saveLoyaltyCardProgramAction(input: {
  enabled: boolean;
  cardTitle: string;
  cardSubtitle: string;
  purchasesRequired: number;
  rewardProductId: string | null;
  rewardName: string;
  stampLabel: string;
  terms: string;
  cardBackground: string;
  cardForeground: string;
  cardAccent: string;
  cardDesign?: LoyaltyCardDesign | null;
}) {
  await assertOwnerLoyaltyEnabled();
  await saveOwnerLoyaltyProgram(input);
}

export async function createLoyaltyCashierAction(input: {
  fullName: string;
  email: string;
  employeeNumber?: string;
}) {
  await assertOwnerCashierEnabled();
  return createOwnerCashier(input);
}

export async function setLoyaltyCashierStatusAction(cashierId: string, active: boolean) {
  await assertOwnerCashierEnabled();
  await setOwnerCashierStatus(cashierId, active);
}

export async function recordLoyaltyCardOperationAction(input: {
  cardCode: string;
  invoiceBarcode?: string;
  invoiceAmount?: number;
  operation?: "stamp" | "redeem";
}) {
  await assertOwnerCashierEnabled();
  return recordOwnerLoyaltyOperation(input);
}

export async function issueLoyaltyCardAction(slug: string) {
  if (!(await publicLoyaltyEnabled(slug))) {
    throw new Error("بطاقات الولاء غير مفعلة لهذه العلامة التجارية");
  }
  return issueCurrentCustomerLoyaltyCard(slug);
}

export async function fetchCustomerLoyaltyCardAction(slug: string) {
  if (!(await publicLoyaltyEnabled(slug))) return null;
  return getCurrentCustomerLoyaltyCardView(slug);
}

export async function fetchLoyaltyCardViewByCodeAction(cardCode: string) {
  const view = await getLoyaltyCardViewByCode(cardCode);
  if (!view) return null;
  if (view.cafeSlug && !(await publicLoyaltyEnabled(view.cafeSlug))) return null;
  return view;
}
