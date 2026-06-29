import {
  getAllPlatformFeatures,
  getDashboardSidebarFeatures,
  getPackageAssignableFeatures,
} from "@/lib/platform/feature-access";
import type { PlatformFeatureCode } from "@/lib/platform/feature-registry";

export type PlatformFeature = PlatformFeatureCode;

export type PlanDurationUnit = "day" | "month" | "year";

export type PlatformPlan = {
  id: string;
  name: string;
  priceMonthly: number;
  offerEnabled: boolean;
  offerPrice?: number;
  offerLabel?: string | null;
  offerEndsAt?: string | null;
  durationOptions?: number[];
  durationUnit: PlanDurationUnit;
  durationCount: number;
  description: string;
  active: boolean;
  isDefault: boolean;
  features: PlatformFeature[];
  categoryId?: string;
  maxOrdersMonthly?: number | null;
  maxProductsMonthly?: number | null;
  maxReservationsMonthly?: number | null;
  maxBranches?: number | null;
  trialDays?: number | null;
  freeAfterTrial?: boolean;
};

export type PlatformCafe = {
  id: string;
  slug: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  ownerLoginEmail?: string;
  passwordAccessNote?: string;
  maintenanceAccountNumber?: string;
  businessCategory?: string;
  businessCategoryLabel?: string;
  logoUrl?: string;
  logoAssetId?: string;
  description?: string;
  instagram?: string;
  whatsapp?: string;
  taxNumber?: string;
  commercialRegister?: string;
  maroofCertificate?: string;
  planId: string;
  planName?: string;
  planExpiresAt?: string;
  planStartedAt?: string;
  planRemainingDays?: number | null;
  hasActivePlan?: boolean;
  status: "نشط" | "موقوف";
  totalRevenue: number;
  totalOrders: number;
  customersCount: number;
  productsCount?: number;
  offersCount?: number;
  branchesCount?: number;
  reservationsCount?: number;
  reviewsCount?: number;
  experienceSubmissionsCount?: number;
  experienceRewardsCount?: number;
  loyaltyCardsCount?: number;
  supportTicketsCount?: number;
  subscriptionsCount?: number;
  renewalsCount?: number;
  createdAt: string;
  publicUrl?: string;
  customDomain?: string;
  customDomainStatus?: "غير مربوط" | "بانتظار التحقق" | "مربوط";
  purchasedDomain?: string;
  purchasedDomainStatus?: "غير مربوط" | "بانتظار التحقق" | "مربوط";
  purchasedDomainCreatedAt?: string;
  purchasedDomainConnectedAt?: string;
};

export type PlatformCustomer = {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  cafeId: string;
  cafeName: string;
  status: "نشط" | "موقوف";
  totalSpent: number;
  loyaltyPoints: number;
  createdAt: string;
};

export type PlatformOperation = {
  id: string;
  cafeId: string;
  cafeName: string;
  customerName?: string;
  type:
    | "طلب"
    | "حجز"
    | "دفع"
    | "تقييم"
    | "تسجيل علامة"
    | "تغيير باقة"
    | "شراء دومين"
    | "ربط دومين";
  title: string;
  amount?: number;
  status: string;
  createdAt: string;
};

export const dashboardPlatformFeatures = getDashboardSidebarFeatures().map((feature) => ({
  id: feature.id,
  title: feature.titleAr,
  href: feature.route,
}));

export const allPlatformFeatures = getAllPlatformFeatures().map((feature) => ({
  id: feature.id,
  title: feature.titleAr,
  category: feature.category,
  route: feature.route,
  status: feature.status,
  packageAssignable: feature.packageAssignable,
}));

export const packageAssignablePlatformFeatures = getPackageAssignableFeatures().map((feature) => ({
  id: feature.id,
  title: feature.titleAr,
  category: feature.category,
  route: feature.route,
  status: feature.status,
  packageAssignable: feature.packageAssignable,
}));

export const mockPlatformPlans: PlatformPlan[] = [];
export const mockPlatformCafes: PlatformCafe[] = [];
export const mockPlatformCustomers: PlatformCustomer[] = [];
export const mockPlatformOperations: PlatformOperation[] = [];

export const mockPlatformOptions = {
  allowCafeSignup: true,
  requireCafeApproval: true,
  platformCommissionPercent: 3,
  supportEmail: "support@barndaksa.com",
  defaultPlanId: "starter",
};
