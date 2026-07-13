"use server";

import { revalidatePath } from "next/cache";
import { setOwnerBattleArenaEnabled } from "@/lib/data/brand-games";

function revalidateBattleArenaPaths(slug: string) {
  revalidatePath("/dashboard/table-wars");
  revalidatePath(`/c/${slug}/games`);
  revalidatePath(`/c/${slug}/play/battle-arena`);
}

export async function enableOwnerBattleArenaAction() {
  const slug = await setOwnerBattleArenaEnabled(true);
  revalidateBattleArenaPaths(slug);
}

export async function disableOwnerBattleArenaAction() {
  const slug = await setOwnerBattleArenaEnabled(false);
  revalidateBattleArenaPaths(slug);
}
