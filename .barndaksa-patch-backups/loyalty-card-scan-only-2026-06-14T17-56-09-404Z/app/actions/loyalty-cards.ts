"use server";

import {
  createOwnerCashier,
  getOwnerLoyaltyCardsDashboard,
  issueCurrentCustomerLoyaltyCard,
  getCurrentCustomerLoyaltyCardView,
  getLoyaltyCardViewByCode,
  recordOwnerLoyaltyOperation,
  saveOwnerLoyaltyProgram,
  setOwnerCashierStatus,
} from "@/lib/data/loyalty-cards";

export async function fetchLoyaltyCardsDashboardAction() {
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
}) {
  await saveOwnerLoyaltyProgram(input);
}

export async function createLoyaltyCashierAction(input: {
  fullName: string;
  email: string;
  employeeNumber?: string;
}) {
  return createOwnerCashier(input);
}

export async function setLoyaltyCashierStatusAction(cashierId: string, active: boolean) {
  await setOwnerCashierStatus(cashierId, active);
}

export async function recordLoyaltyCardOperationAction(input: {
  cardCode: string;
  invoiceBarcode: string;
  invoiceAmount: number;
  operation: "stamp" | "redeem";
}) {
  return recordOwnerLoyaltyOperation(input);
}

export async function issueLoyaltyCardAction(slug: string) {
  return issueCurrentCustomerLoyaltyCard(slug);
}


export async function fetchCustomerLoyaltyCardAction(slug: string) {
  return getCurrentCustomerLoyaltyCardView(slug);
}

export async function fetchLoyaltyCardViewByCodeAction(cardCode: string) {
  return getLoyaltyCardViewByCode(cardCode);
}
