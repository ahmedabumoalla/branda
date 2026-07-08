"use server";

import { revalidatePath } from "next/cache";
import {
  disableOwnerTableWarsTables,
  enableOwnerTableWarsDemoTable,
} from "@/lib/data/table-wars";

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
