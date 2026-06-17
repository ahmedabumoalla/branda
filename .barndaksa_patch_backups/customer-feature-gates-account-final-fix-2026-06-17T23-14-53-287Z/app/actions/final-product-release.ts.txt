"use server";

import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug } from "@/lib/data/cafes";

export async function createPublicSupportTicketAction(input: { slug: string; name: string; phone: string; message: string }) {
  try {
    const cafe = await getCafeBySlug(input.slug);
    if (!cafe) return { ok: false as const, message: "العلامة غير موجودة" };
    const supabase = await createClient();
    const { error } = await supabase.from("brand_support_tickets").insert({ cafe_id: cafe.id, requester_name: input.name.trim(), requester_phone: input.phone.trim(), message: input.message.trim(), status: "open" });
    if (error) throw error;
    return { ok: true as const, message: "تم إرسال طلب الدعم" };
  } catch (error) {
    console.error("[createPublicSupportTicketAction]", error);
    return { ok: false as const, message: "تعذر إرسال طلب الدعم" };
  }
}

export async function submitExperienceProofAction(input: { slug: string; customerName: string; contact: string; url: string; agreed: boolean }) {
  try {
    if (!input.agreed) return { ok: false as const, message: "يجب الموافقة على الشروط" };
    const cafe = await getCafeBySlug(input.slug);
    if (!cafe) return { ok: false as const, message: "العلامة غير موجودة" };
    const supabase = await createClient();
    const { error } = await supabase.from("experience_proof_links").insert({ cafe_id: cafe.id, customer_name: input.customerName.trim(), contact: input.contact.trim(), proof_url: input.url.trim(), status: "pending" });
    if (error) throw error;
    return { ok: true as const, message: "تم إرسال رابط التوثيق وسيتم الرد خلال سبعة أيام عمل" };
  } catch (error) {
    console.error("[submitExperienceProofAction]", error);
    return { ok: false as const, message: "تعذر إرسال رابط التوثيق" };
  }
}
