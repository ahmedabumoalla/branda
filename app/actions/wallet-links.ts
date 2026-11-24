"use server";

import { revalidatePath } from "next/cache";
import { saveOwnerWalletLinks } from "@/lib/data/wallet-links";
import type { WalletLink } from "@/lib/loyalty/wallet-links";

export async function saveWalletLinksAction(input: WalletLink[]): Promise<{ ok: true; links: WalletLink[] } | { ok: false; message: string }> {
  try {
    const result = await saveOwnerWalletLinks(input);
    if (result.ok) revalidatePath("/dashboard/loyalty");
    return result;
  } catch {
    return { ok: false, message: "تعذر حفظ روابط البطاقة تحقق من صلاحية الحساب وحاول مرة أخرى" };
  }
}
