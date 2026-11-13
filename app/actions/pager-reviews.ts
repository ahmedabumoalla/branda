"use server";
import { savePagerGoogleReviewLink } from "@/lib/data/pager-customers";
export async function savePagerGoogleReviewAction(value: string) {
  try { return { ok: true as const, url: await savePagerGoogleReviewLink(value) }; }
  catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : "تعذر حفظ الرابط" }; }
}
