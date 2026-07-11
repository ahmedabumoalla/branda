"use server";

import { revalidatePath } from "next/cache";
import {
  disableOwnerTableWarsTables,
  enableOwnerTableWarsDemoTable,
} from "@/lib/data/table-wars";
import {
  getTableWarsV2SnapshotForCustomer,
  finishTableWarsV2RealtimeLiteRoundForCustomer,
  joinTableWarsV2Customer,
  startNewTableWarsLiteRoundForCustomer,
  sendTableWarsV2UnitsForCustomer,
  tickTableWarsV2ForActiveSession,
} from "@/lib/table-wars/v2-data";
import type { TableWarsTeam } from "@/lib/table-wars/v2-types";

function revalidateTableWarsPaths(slug: string) {
  revalidatePath("/dashboard/table-wars");
  revalidatePath(`/c/${slug}`);
  revalidatePath(`/c/${slug}/products/popular`);
  revalidatePath(`/c/${slug}/play/table-wars`);
}

export async function enableOwnerTableWarsDemoAction() {
  const slug = await enableOwnerTableWarsDemoTable();
  revalidateTableWarsPaths(slug);
}

export async function disableOwnerTableWarsAction() {
  const slug = await disableOwnerTableWarsTables();
  revalidateTableWarsPaths(slug);
}

export async function joinTableWarsV2Team(slug: string, team: TableWarsTeam, nickname: string) {
  const normalizedNickname = typeof nickname === "string" ? nickname.trim().replace(/\s+/g, " ") : "";
  if (normalizedNickname.length < 2 || normalizedNickname.length > 20) {
    throw new Error("الاسم المستعار يجب أن يكون من 2 إلى 20 حرفًا.");
  }

  const result = await joinTableWarsV2Customer(slug, team, normalizedNickname);
  revalidateTableWarsPaths(result.snapshot.cafeSlug);
  return result;
}

export async function getTableWarsV2SnapshotAction(slug: string) {
  return getTableWarsV2SnapshotForCustomer(slug);
}

export async function sendTableWarsV2UnitsAction(input: {
  fromCellId: string;
  toCellId: string;
  soldiers?: number;
  percentage?: number;
}) {
  const result = await sendTableWarsV2UnitsForCustomer(input);
  revalidateTableWarsPaths(result.snapshot.cafeSlug);
  return result;
}

export async function tickTableWarsV2Action() {
  const snapshot = await tickTableWarsV2ForActiveSession();
  revalidateTableWarsPaths(snapshot.cafeSlug);
  return snapshot;
}

export async function finishTableWarsV2RealtimeLiteRoundAction(
  slug: string,
  winningTeam: TableWarsTeam,
  roundId?: string | null,
) {
  const snapshot = await finishTableWarsV2RealtimeLiteRoundForCustomer(slug, winningTeam, roundId);
  revalidateTableWarsPaths(snapshot.cafeSlug);
  return snapshot;
}

export async function startNewTableWarsLiteRoundAction(slug: string) {
  const snapshot = await startNewTableWarsLiteRoundForCustomer(slug);
  revalidateTableWarsPaths(snapshot.cafeSlug);
  return snapshot;
}
