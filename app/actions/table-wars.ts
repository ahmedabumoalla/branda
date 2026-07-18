"use server";

import { revalidatePath } from "next/cache";
import { clearServerMemoryCache } from "@/lib/performance/server-memory-cache";
import { getPublicCafeBySlugAdmin } from "@/lib/data/cafes";
import { getCustomerProfileForCustomerSession } from "@/lib/data/customers";
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
  TableWarsV2StartActionResult,
} from "@/lib/table-wars/v2-types";

const SAFE_JOIN_ERROR = "تعذر الانضمام إلى ردهة حرب الطاولات. حاول مرة أخرى.";
const SAFE_START_ERROR = "تعذر بدء جولة حرب الطاولات حاليًا. حاول مرة أخرى.";
const SAFE_SNAPSHOT_ERROR = "تعذر تحميل حالة حرب الطاولات حاليًا.";

function tableWarsServerErrorDetails(error: unknown) {
  const value = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  return {
    code: typeof value?.code === "string" ? value.code : undefined,
    message:
      typeof value?.message === "string"
        ? value.message
        : error instanceof Error
          ? error.message
          : undefined,
    details: typeof value?.details === "string" ? value.details : undefined,
    hint: typeof value?.hint === "string" ? value.hint : undefined,
  };
}

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
    const normalizedSlug = slug.trim().toLowerCase();
    const [cafe, customerProfile] = await Promise.all([
      getPublicCafeBySlugAdmin(normalizedSlug),
      getCustomerProfileForCustomerSession(normalizedSlug),
    ]);
    const cafeId = cafe?.id ? String(cafe.id) : null;
    const customerProfileId = customerProfile?.id ? String(customerProfile.id) : null;
    const customerCafeId = customerProfile?.cafe_id ? String(customerProfile.cafe_id) : null;

    if (!customerProfileId || !cafeId || customerCafeId !== cafeId) {
      console.error("[table-wars][join-lobby][auth-context]", {
        cafeId,
        slug: normalizedSlug,
        hasCustomerProfile: Boolean(customerProfile),
        customerProfileId,
      });
      return { ok: false, message: SAFE_JOIN_ERROR };
    }

    const result = await joinTableWarsV2Customer(
      normalizedSlug,
      team,
      normalizedNickname,
      {
        cafeId,
        customerProfileId,
      },
    );
    return result;
  } catch (error) {
    console.error("[table-wars][join-lobby]", tableWarsServerErrorDetails(error));
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
  playerId?: string | null,
): Promise<TableWarsV2StartActionResult> {
  const normalizedSlug = slug.trim().toLowerCase();
  const normalizedRoundId = typeof roundId === "string" ? roundId.trim() : "";
  const normalizedPlayerId = typeof playerId === "string" ? playerId.trim() : "";
  let hasCustomerProfile = false;
  let customerProfileId: string | null = null;
  let roundStatus: string | null = null;
  let foundPlayer = false;
  let playerIsConnected = false;

  try {
    const [cafe, customerProfile] = await Promise.all([
      getPublicCafeBySlugAdmin(normalizedSlug),
      getCustomerProfileForCustomerSession(normalizedSlug),
    ]);
    const cafeId = cafe?.id ? String(cafe.id) : null;
    customerProfileId = customerProfile?.id ? String(customerProfile.id) : null;
    const customerCafeId = customerProfile?.cafe_id ? String(customerProfile.cafe_id) : null;
    hasCustomerProfile = Boolean(customerProfileId && cafeId && customerCafeId === cafeId);
    if (!hasCustomerProfile || !cafeId || !customerProfileId) {
      throw Object.assign(new Error("تعذر التحقق من جلسة لاعب حرب الطاولات."), {
        code: "TABLE_WARS_START_PLAYER_MISSING",
      });
    }

    const snapshot = await startTableWarsV2LobbyRoundForCustomer(
      normalizedSlug,
      normalizedRoundId,
      {
        cafeId,
        customerProfileId,
        playerId: normalizedPlayerId || null,
      },
    );
    const roundStatus = snapshot.round?.status ?? null;
    const isActive = roundStatus === "active";
    console.info("[table-wars][start-lobby-result]", {
      ok: isActive,
      hasCustomerProfile,
      hasRoundId: Boolean(normalizedRoundId),
      hasPlayerId: Boolean(normalizedPlayerId),
      roundStatus,
      foundPlayer: Boolean(snapshot.currentPlayer),
      playerIsConnected: Boolean(snapshot.currentPlayer?.isConnected && !snapshot.currentPlayer.leftAt),
      startAttemptResult: isActive ? "active" : "snapshot-not-active",
    });
    if (!isActive) {
      return {
        ok: false,
        message: "بدأت محاولة الجولة، لكن تعذر تحميل حالتها النشطة. أعد المحاولة.",
        requiresRejoin: false,
      };
    }
    return { ok: true, snapshot };
  } catch (error) {
    const value = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
    const startContext =
      value?.startContext && typeof value.startContext === "object"
        ? (value.startContext as Record<string, unknown>)
        : null;
    roundStatus = typeof startContext?.roundStatus === "string" ? startContext.roundStatus : null;
    foundPlayer = startContext?.foundPlayer === true;
    playerIsConnected = startContext?.playerIsConnected === true;
    const requiresRejoin = value?.code === "TABLE_WARS_START_PLAYER_MISSING";

    console.error("[table-wars][start-lobby]", {
      hasCustomerProfile,
      hasRoundId: Boolean(normalizedRoundId),
      hasPlayerId: Boolean(normalizedPlayerId),
      roundStatus,
      foundPlayer,
      playerIsConnected,
      startAttemptResult: requiresRejoin ? "requires-rejoin" : "failed",
    });
    console.info("[table-wars][start-lobby-result]", {
      ok: false,
      hasCustomerProfile,
      hasRoundId: Boolean(normalizedRoundId),
      hasPlayerId: Boolean(normalizedPlayerId),
      roundStatus,
      foundPlayer,
      playerIsConnected,
      startAttemptResult: requiresRejoin ? "requires-rejoin" : "failed",
    });
    return {
      ok: false,
      message:
        requiresRejoin && error instanceof Error
          ? error.message
          : SAFE_START_ERROR,
      requiresRejoin,
    };
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
