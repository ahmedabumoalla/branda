"use server";

import { revalidatePath } from "next/cache";
import {
  createOwnerCashier,
  updateOwnerCashierPermissions,
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
import { getAuthorizedWalletMember } from "@/lib/data/loyalty-experience";

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
  revalidatePath("/dashboard/loyalty", "layout");
}

export async function createLoyaltyCashierAction(input: {
  fullName: string;
  phone: string;
  employeeNumber?: string;
  canUseLoyalty?: boolean;
  canUsePager?: boolean;
  pagerStation?: string;
}) {
  await assertOwnerCashierEnabled();
  const cashier = await createOwnerCashier(input);
  revalidatePath("/dashboard/cashier");
  return cashier;
}

export async function updateCashierPermissionsAction(input: {
  cashierId: string; canUseLoyalty: boolean; canUsePager: boolean; pagerStation: string;
}) {
  await assertOwnerCashierEnabled();
  const cashier = await updateOwnerCashierPermissions(input);
  revalidatePath("/dashboard/cashier");
  return cashier;
}

export async function setLoyaltyCashierStatusAction(cashierId: string, active: boolean) {
  await assertOwnerCashierEnabled();
  await setOwnerCashierStatus(cashierId, active);
  revalidatePath("/dashboard/cashier");
}

export async function recordLoyaltyCardOperationAction(input: {
  cardCode: string;
  invoiceBarcode?: string;
  invoiceAmount?: number;
  operation?: "stamp" | "redeem";
}) {
  await assertOwnerLoyaltyEnabled();
  return recordOwnerLoyaltyOperation(input);
}

export async function issueLoyaltyCardAction(slug: string) {
  if (!(await publicLoyaltyEnabled(slug))) {
    throw new Error("بطاقات الولاء غير مفعلة لهذه العلامة التجارية");
  }
  const card = await issueCurrentCustomerLoyaltyCard(slug);
  revalidatePath(`/loyalty/${encodeURIComponent(slug)}`);
  return card;
}

export async function fetchCustomerLoyaltyCardAction(slug: string) {
  if (!(await publicLoyaltyEnabled(slug))) return null;
  return getCurrentCustomerLoyaltyCardView(slug);
}

export async function fetchLoyaltyCardViewByCodeAction(cardCode: string) {
  const view = await getLoyaltyCardViewByCode(cardCode);
  if (!view) return null;
  if (view.cafeSlug === "rast" && !(await getAuthorizedWalletMember(cardCode))) return null;
  if (view.cafeSlug && !(await publicLoyaltyEnabled(view.cafeSlug))) return null;
  return view;
}
