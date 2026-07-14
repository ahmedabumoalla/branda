"use server";

import { revalidatePath } from "next/cache";
import { setOwnerBattleArenaEnabled } from "@/lib/data/brand-games";
import { clearServerMemoryCache } from "@/lib/performance/server-memory-cache";

function revalidateBattleArenaPaths(slug: string) {
  clearServerMemoryCache(`public-cafe-fast:${slug}`);
  clearServerMemoryCache(`public-cafe:${slug}`);
  revalidatePath("/dashboard/table-wars");
  revalidatePath(`/c/${slug}`);
  revalidatePath(`/c/${slug}/games`);
  revalidatePath(`/c/${slug}/play/battle-arena`);
  revalidatePath(`/api/public/cafe/${slug}`);
  revalidatePath(`/api/public/cafe/${slug}/fast`);
}

export async function enableOwnerBattleArenaAction() {
  const slug = await setOwnerBattleArenaEnabled(true);
  revalidateBattleArenaPaths(slug);
}

export async function disableOwnerBattleArenaAction() {
  const slug = await setOwnerBattleArenaEnabled(false);
  revalidateBattleArenaPaths(slug);
}
