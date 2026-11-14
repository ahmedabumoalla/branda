/** Dedicated identity; other retail and manufacturing brands keep their own storefronts. */
import { ALDEEM_SLUG } from "@/lib/platform/aldeem";
export { ALDEEM_SLUG } from "@/lib/platform/aldeem";
export function isAldeemStore(slug: string) { return slug === ALDEEM_SLUG; }
