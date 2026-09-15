import type { BusinessCategoryId } from "@/lib/platform/business-categories";

export type BusinessCapability =
  | "menu"
  | "orders"
  | "loyalty"
  | "rewards"
  | "tickets"
  | "ticket_orders"
  | "checkin"
  | "cashier"
  | "experience_rewards"
  | "reports";

const DEFAULT_CAPABILITIES: BusinessCapability[] = [];

export const BUSINESS_CAPABILITIES: Partial<Record<BusinessCategoryId, BusinessCapability[]>> = {
  cafes_coffee: ["menu", "orders", "loyalty", "rewards", "cashier"],
  restaurants: ["menu", "orders", "loyalty", "rewards", "cashier"],
  events_conferences: [
    "tickets",
    "ticket_orders",
    "checkin",
    "cashier",
    "loyalty",
    "experience_rewards",
    "reports",
  ],
};

export function getBusinessCapabilities(category?: string | null): BusinessCapability[] {
  return BUSINESS_CAPABILITIES[category as BusinessCategoryId] ?? DEFAULT_CAPABILITIES;
}

export function businessHasCapability(
  category: string | null | undefined,
  capability: BusinessCapability
) {
  return getBusinessCapabilities(category).includes(capability);
}
