"use server";

import { revalidatePath } from "next/cache";
import {
  disableOwnerTableWarsTables,
  enableOwnerTableWarsDemoTable,
} from "@/lib/data/table-wars";
import {
  getTableWarsV2SnapshotForCustomer,
  joinTableWarsV2Customer,
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

export async function joinTableWarsV2Team(slug: string, team: TableWarsTeam) {
  const result = await joinTableWarsV2Customer(slug, team);
  revalidateTableWarsPaths(result.snapshot.cafeSlug);
  return result;
}

export async function getTableWarsV2SnapshotAction(slug: string) {
  return getTableWarsV2SnapshotForCustomer(slug);
}
