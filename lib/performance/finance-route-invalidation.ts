import "server-only";
import { revalidatePath } from "next/cache";

/** Call only after an authorized financial write has been confirmed. */
export function invalidateFinanceViews(slug?: string) {
  revalidatePath("/dashboard/finance", "layout");
  if (slug) revalidatePath(`/finance/${encodeURIComponent(slug)}`, "layout");
}
