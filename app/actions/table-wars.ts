"use server";

import { revalidatePath } from "next/cache";
import { clearServerMemoryCache } from "@/lib/performance/server-memory-cache";
import {
  disableOwnerTableWarsTables,
  enableOwnerTableWarsDemoTable,
} from "@/lib/data/table-wars";
import {
  getTableWarsV2SnapshotForCustomer,
  finishTableWarsV2RealtimeLiteRoundForCustomer,
  joinTableWarsV2Customer,
  leaveTableWarsV2RoundForCustomer,
  startTableWarsV2LobbyRoundForCustomer,
  startNewTableWarsLiteRoundForCustomer,
  sendTableWarsV2UnitsForCustomer,
  tickTableWarsV2ForActiveSession,
} from "@/lib/table-wars/v2-data";
import type {
  TableWarsTeam,
  TableWarsV2JoinActionResult,
  TableWarsV2SnapshotActionResult,
} from "@/lib/table-wars/v2-types";

const SAFE_JOIN_ERROR = "تعذر الانضمام إلى ردهة حرب الطاولات. حاول مرة أخرى.";
const SAFE_START_ERROR = "تعذر بدء جولة حرب الطاولات حاليًا. حاول مرة أخرى.";
const SAFE_SNAPSHOT_ERROR = "تعذر تحميل حالة حرب الطاولات حاليًا.";

function revalidateTableWarsPaths(slug: string) {
  revalidatePath("/dashboard/table-wars");
  revalidatePath(`/c/${slug}`);
  revalidatePath(`/c/${slug}/products/popular`);
  revalidatePath(`/c/${slug}/play/table-wars`);
}

function revalidateTableWarsAvailabilityPaths(slug: string) {
  clearServerMemoryCache(`public-cafe-fast:${slug}`);
  clearServerMemoryCache(`public-cafe:${slug}`);
  revalidateTableWarsPaths(slug);
  revalidatePath(`/c/${slug}/games`);
  revalidatePath(`/api/public/cafe/${slug}`);
  revalidatePath(`/api/public/cafe/${slug}/fast`);
}

export async function enableOwnerTableWarsDemoAction() {
  const slug = await enableOwnerTableWarsDemoTable();
  revalidateTableWarsAvailabilityPaths(slug);
}

export async function disableOwnerTableWarsAction() {
  const slug = await disableOwnerTableWarsTables();
  revalidateTableWarsAvailabilityPaths(slug);
}

export async function joinTableWarsV2Team(
  slug: string,
  team: TableWarsTeam,
  nickname: string,
): Promise<TableWarsV2JoinActionResult> {
  const normalizedNickname = typeof nickname === "string" ? nickname.trim().replace(/\s+/g, " ") : "";
  if (normalizedNickname.length < 2 || normalizedNickname.length > 20) {
    return { ok: false, message: "الاسم المستعار يجب أن يكون من 2 إلى 20 حرفًا." };
  }
  if (team !== "blue" && team !== "red") {
    return { ok: false, message: SAFE_JOIN_ERROR };
  }

  try {
    const result = await joinTableWarsV2Customer(slug, team, normalizedNickname);
    return result;
  } catch (error) {
    console.error("[table-wars] lobby join failed", error);
    return { ok: false, message: SAFE_JOIN_ERROR };
  }
}

export async function getTableWarsV2SnapshotAction(slug: string): Promise<TableWarsV2SnapshotActionResult> {
  try {
    const snapshot = await getTableWarsV2SnapshotForCustomer(slug);
    return { ok: true, snapshot };
  } catch (error) {
    console.error("[table-wars] snapshot load failed", error);
    return { ok: false, message: SAFE_SNAPSHOT_ERROR };
  }
}

export async function startTableWarsV2LobbyRoundAction(
  slug: string,
  roundId: string,
): Promise<TableWarsV2SnapshotActionResult> {
  try {
    const snapshot = await startTableWarsV2LobbyRoundForCustomer(slug, roundId);
    return { ok: true, snapshot };
  } catch (error) {
    console.error("[table-wars] lobby start failed", error);
    return { ok: false, message: SAFE_START_ERROR };
  }
}

export async function leaveTableWarsV2RoundAction(slug: string, roundId: string) {
  return leaveTableWarsV2RoundForCustomer(slug, roundId);
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
