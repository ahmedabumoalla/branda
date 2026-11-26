import "server-only";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getOwnerLoyaltyCustomerDetail } from "@/lib/data/loyalty-customers";
import { createClient } from "@/lib/supabase/server";
import { loyaltyCustomerPhone } from "@/lib/loyalty/customer-phone";
import { getBrandPhoneCountry } from "@/lib/data/brand-phone-country";
import { stampCardLinkMessage } from "@/lib/loyalty/read-card-links";

export type LoyaltyCustomerCardMessage = { message: string; whatsappUrl: string };

/** The same card link message the platform sends after a stamp, built on request so the brand can send it by hand
 * from its own phone while Branda's numbers carry access messages only. Nothing is sent here. */
export async function getOwnerLoyaltyCustomerCardMessage(id: unknown, downloadedOnly: unknown = false): Promise<LoyaltyCustomerCardMessage> {
  // The directory read authorises the caller for this brand and this customer before any link is created
  const customer = await getOwnerLoyaltyCustomerDetail(id, downloadedOnly);
  if (customer.cardStatus === "suspended") throw new Error("Card suspended");
  const cafe = await requireOwnerCafeContext();
  const phone = customer.phone ? loyaltyCustomerPhone(customer.phone, await getBrandPhoneCountry(cafe.id), cafe.id) : null;
  if (!phone) throw new Error("customer_phone_unavailable");
  const db = await createClient();
  const { data: card } = await db.from("loyalty_cards").select("stamps_in_cycle").eq("cafe_id", cafe.id).eq("customer_profile_id", customer.id).eq("status", "active").maybeSingle();
  const message = stampCardLinkMessage({
    cafeId: cafe.id, profileId: customer.id, brandSlug: cafe.slug, brandName: cafe.name, phone,
    // A card with its first stamp gets the new card wording; a card further along gets the stamp wording
    cardCreated: Number(card?.stamps_in_cycle ?? 1) <= 1,
  });
  return { message, whatsappUrl: `https://wa.me/${phone}?text=${encodeURIComponent(message)}` };
}
