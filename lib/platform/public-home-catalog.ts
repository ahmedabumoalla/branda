export type PublicHomePlan = {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  annualDiscountPercent: number;
  durationUnit: "day" | "month" | "year";
  durationCount: number;
  trialDays: number | null;
  freeAfterTrial: boolean;
  maxProductsMonthly: number | null;
  maxOrdersMonthly: number | null;
  maxBranches: number | null;
  features: { id: string; label: string }[];
  durations: {
    months: number;
    label: string;
    baseAmount: number;
    discountPercent: number;
    discountAmount: number;
    totalAmount: number;
  }[];
};

export type PublicHomePartner = {
  id: string;
  name: string;
  logoUrl: string | null;
};

export type PublicHomeMenu = PublicHomePartner & { href: string };

export type PublicHomeCatalog = {
  plans: PublicHomePlan[];
  partners: PublicHomePartner[];
  menus: PublicHomeMenu[];
  errors: { plans: boolean; partners: boolean; menus: boolean };
};
