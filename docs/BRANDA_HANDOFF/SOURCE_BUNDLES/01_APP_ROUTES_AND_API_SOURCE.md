# App Routes and API Source

# File: app/actions/admin.ts

```typescript
"use server";

import {
  getAdminCafes,
  getAdminCustomers,
  getAdminOperations,
  getOwnerActivePlanId,
  getPlatformPlans,
  savePlatformPlans,
  updateCafePlan,
  updateCafeStatus,
} from "@/lib/data/admin";
import type { PlatformPlan } from "@/lib/platform/admin-data";

export async function fetchPlatformPlansAction() {
  return getPlatformPlans();
}

export async function fetchOwnerPlanIdAction() {
  return getOwnerActivePlanId();
}

export async function fetchAdminCafesAction() {
  return getAdminCafes();
}

export async function fetchAdminCustomersAction() {
  return getAdminCustomers();
}

export async function fetchAdminOperationsAction() {
  return getAdminOperations();
}

export async function savePlatformPlansAction(plans: PlatformPlan[]) {
  await savePlatformPlans(plans);
}

export async function updateCafePlanAction(cafeId: string, planId: string) {
  await updateCafePlan(cafeId, planId);
}

export async function updateCafeStatusAction(cafeId: string, active: boolean) {
  await updateCafeStatus(cafeId, active);
}

export async function savePlatformSettingsAction(
  settings: import("@/lib/data/platform-settings").PlatformSettings
) {
  const { savePlatformSettings } = await import("@/lib/data/platform-settings");
  await savePlatformSettings(settings);
}

```

# File: app/actions/auth.ts

```typescript
"use server";



import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {

  loginCustomerByEmail,

  registerCustomer,

} from "@/lib/data/customers";

import type { BrandaCustomerSession } from "@/lib/customer/session";



export async function loginOwnerAction(email: string, password: string) {

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });



  if (error || !data.user) {

    return { ok: false as const, message: "بيانات الدخول غير صحيحة", redirectTo: null };

  }



  const { data: profile } = await supabase

    .from("profiles")

    .select("role, status")

    .eq("id", data.user.id)

    .maybeSingle();



  if (profile?.status === "suspended") {

    await supabase.auth.signOut();

    return {

      ok: false as const,

      message: "هذا الحساب موقوف، تواصل مع إدارة المنصة",

      redirectTo: null,

    };

  }



  const redirectTo =

    profile?.role === "platform_admin"

      ? "/admin"

      : profile?.role === "cafe_owner" ||

          profile?.role === "cafe_manager" ||

          profile?.role === "cafe_staff"

        ? "/dashboard"

        : null;



  if (!redirectTo) {

    await supabase.auth.signOut();

    return { ok: false as const, message: "لا تملك صلاحية الدخول لهذه اللوحة", redirectTo: null };

  }



  return { ok: true as const, message: "تم تسجيل الدخول بنجاح", redirectTo };

}



export async function logoutAction() {

  const supabase = await createClient();

  await supabase.auth.signOut();

  redirect("/login");

}



export async function registerCustomerAction(

  cafeSlug: string,

  email: string,

  password: string,

  fullName: string,

  phone: string

): Promise<{ ok: boolean; message: string; session?: BrandaCustomerSession }> {

  try {

    const session = await registerCustomer({ cafeSlug, email, password, fullName, phone });

    return { ok: true, message: "تم إنشاء الحساب بنجاح", session };

  } catch (err) {

    console.error("[registerCustomerAction]", err);

    const message =

      err instanceof Error && err.message.includes("already registered")

        ? "البريد مسجّل مسبقًا، جرّب تسجيل الدخول"

        : "تعذر إنشاء الحساب، تحقق من البيانات وحاول مرة أخرى";

    return { ok: false, message };

  }

}



export async function loginCustomerAction(

  cafeSlug: string,

  email: string,

  password: string

): Promise<{ ok: boolean; message: string; session?: BrandaCustomerSession }> {

  try {

    const session = await loginCustomerByEmail({ cafeSlug, email, password });

    return { ok: true, message: "تم تسجيل الدخول", session };

  } catch (err) {

    console.error("[loginCustomerAction]", err);

    return { ok: false, message: "بيانات الدخول غير صحيحة" };

  }

}



export async function getCustomerSessionAction(cafeSlug: string) {

  const supabase = await createClient();

  const {

    data: { user },

  } = await supabase.auth.getUser();

  if (!user) return null;



  const { getCustomerProfileByUser, mapCustomerProfileToSession } = await import(

    "@/lib/data/customers"

  );

  const profile = await getCustomerProfileByUser(cafeSlug, user.id);

  if (!profile) return null;

  const session = mapCustomerProfileToSession(cafeSlug, profile);

  if (profile.avatar_storage_path) {
    const { resolvePrivateStoragePathToUrl, storageBucketForAvatar } = await import(
      "@/lib/storage/resolve-storage-url"
    );
    session.avatarUrl = await resolvePrivateStoragePathToUrl(
      storageBucketForAvatar(),
      profile.avatar_storage_path as string
    );
  }

  return session;

}



export async function logoutCustomerAction() {

  const supabase = await createClient();

  await supabase.auth.signOut();

}


```

# File: app/actions/branches.ts

```typescript
"use server";

import { getOwnerBranches, softDeleteBranch, upsertBranch } from "@/lib/data/branches";
import type { CafeBranch } from "@/lib/mock/branches";

export async function fetchOwnerBranchesAction() {
  return getOwnerBranches();
}

export async function saveBranchAction(branch: CafeBranch) {
  return upsertBranch({
    id: /^[0-9a-f-]{36}$/i.test(branch.id) ? branch.id : undefined,
    name: branch.name,
    address: branch.address,
    city: branch.city,
    phone: branch.phone,
    workingHours: branch.workingHours,
    lat: branch.lat ?? null,
    lng: branch.lng ?? null,
    active: branch.active,
  });
}

export async function deleteBranchAction(branchId: string) {
  await softDeleteBranch(branchId);
}

```

# File: app/actions/customer-media.ts

```typescript
"use server";

import { getCafeBySlug } from "@/lib/data/cafes";
import { requireCustomerProfileForSession, mapCustomerProfileToSession } from "@/lib/data/customers";
import { uploadCustomerAvatar, deleteCustomerAvatar } from "@/lib/storage/customer-media-server";
import { uploadExperienceSubmissionMedia } from "@/lib/storage/experience-media-server";
import { resolvePrivateStoragePathToUrl, storageBucketForAvatar } from "@/lib/storage/resolve-storage-url";
import { createClient } from "@/lib/supabase/server";
import type { BrandaCustomerSession } from "@/lib/customer/session";

export async function uploadCustomerAvatarAction(cafeSlug: string, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Missing file");
  }

  const { profile } = await requireCustomerProfileForSession(cafeSlug);
  const { storagePath, previousStoragePath } = await uploadCustomerAvatar(cafeSlug, file);
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_customer_avatar_storage_path", {
    p_profile_id: profile.id,
    p_storage_path: storagePath,
  });

  if (error) {
    await supabase.storage.from("customer-avatars").remove([storagePath]);
    throw error;
  }

  if (
    previousStoragePath &&
    previousStoragePath !== storagePath
  ) {
    try {
      await deleteCustomerAvatar(previousStoragePath);
    } catch {
      // DB updated; stale object cleanup is best-effort
    }
  }

  const { data, error: fetchError } = await supabase
    .from("customer_profiles")
    .select("*")
    .eq("id", profile.id)
    .single();

  if (fetchError || !data) throw fetchError ?? new Error("Profile not found");

  const session = mapCustomerProfileToSession(cafeSlug, data);
  const signedUrl = await resolvePrivateStoragePathToUrl(storageBucketForAvatar(), storagePath);
  return {
    ...session,
    avatarUrl: signedUrl,
    avatarAssetId: storagePath,
  } satisfies BrandaCustomerSession;
}

/** Updates name/email/phone only — avatar changes go through uploadCustomerAvatarAction. */
export async function updateCustomerProfileAction(
  cafeSlug: string,
  input: { fullName: string; email?: string; phone?: string }
) {
  const { profile } = await requireCustomerProfileForSession(cafeSlug);
  const cafe = await getCafeBySlug(cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_customer_profile", {
    p_cafe_id: cafe.id,
    p_full_name: input.fullName.trim(),
    p_email: input.email?.trim() || null,
    p_phone: input.phone?.trim() || null,
  });

  if (error) throw error;

  const { data, error: fetchError } = await supabase
    .from("customer_profiles")
    .select("*")
    .eq("id", profile.id)
    .single();

  if (fetchError || !data) throw fetchError ?? new Error("Profile not found");

  const session = mapCustomerProfileToSession(cafeSlug, data);
  if (data.avatar_storage_path) {
    session.avatarUrl = await resolvePrivateStoragePathToUrl(
      storageBucketForAvatar(),
      data.avatar_storage_path as string
    );
    session.avatarAssetId = data.avatar_storage_path as string;
  }

  return session;
}

export async function uploadExperienceMediaAction(
  cafeSlug: string,
  submissionId: string,
  formData: FormData
) {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Missing file");
  }

  const cafe = await getCafeBySlug(cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  return uploadExperienceSubmissionMedia(cafeSlug, submissionId, file);
}

```

# File: app/actions/customer.ts

```typescript
"use server";



import {

  getCustomerOrdersForProfile,

  getCustomerReservationsForProfile,

  requireCustomerProfileForSession,

} from "@/lib/data/customers";

import {

  getNotificationsForAudience,

  markCustomerNotificationRead,

} from "@/lib/data/notifications";

import { createReview, getPublicReviewsByProduct } from "@/lib/data/reviews";

import { getPublicExperienceCampaigns } from "@/lib/data/experience";

import { submitExperienceCampaign } from "@/lib/platform/experience-flow";

import type { AppNotification } from "@/lib/mock/notifications";



export async function fetchCustomerOrdersAction(cafeSlug: string) {

  const { profile } = await requireCustomerProfileForSession(cafeSlug);

  return getCustomerOrdersForProfile(cafeSlug, profile.id as string);

}



export async function fetchCustomerReservationsAction(cafeSlug: string) {

  const { profile } = await requireCustomerProfileForSession(cafeSlug);

  return getCustomerReservationsForProfile(cafeSlug, profile.id as string);

}



export async function fetchCustomerNotificationsAction(

  cafeSlug: string

): Promise<AppNotification[]> {

  const { profile } = await requireCustomerProfileForSession(cafeSlug);

  return getNotificationsForAudience("customer", cafeSlug, profile.id as string);

}



export async function markCustomerNotificationReadAction(

  cafeSlug: string,

  notificationId: string

) {

  const { profile } = await requireCustomerProfileForSession(cafeSlug);

  await markCustomerNotificationRead(cafeSlug, notificationId);

}



export async function fetchProductReviewsAction(cafeSlug: string, productId: string) {

  return getPublicReviewsByProduct(cafeSlug, productId);

}



export async function submitProductReviewAction(input: {

  cafeSlug: string;

  productId: string;

  customerId: string;

  customerName: string;

  rating: number;

  comment: string;

}) {

  return createReview(input);

}



export async function fetchPublicExperienceCampaignsAction(cafeSlug: string) {

  return getPublicExperienceCampaigns(cafeSlug);

}



export async function submitExperienceCampaignAction(

  input: Parameters<typeof submitExperienceCampaign>[0]

) {

  return submitExperienceCampaign(input);

}


```

# File: app/actions/customers.ts

```typescript
"use server";



import { getOwnerCustomersDashboard } from "@/lib/data/customers";



export async function fetchOwnerCustomersDashboardAction() {

  return getOwnerCustomersDashboard();

}


```

# File: app/actions/experience.ts

```typescript
"use server";

import {
  approveExperienceSubmission,
  getOwnerExperienceData,
  rejectExperienceSubmission,
  updateExperienceMetrics,
  upsertExperienceCampaign,
} from "@/lib/data/experience";
import type { ExperienceCampaign } from "@/lib/mock/experience-campaigns";

export async function fetchOwnerExperienceAction() {
  return getOwnerExperienceData();
}

export async function saveExperienceCampaignAction(campaign: ExperienceCampaign) {
  return upsertExperienceCampaign({
    id: /^[0-9a-f-]{36}$/i.test(campaign.id) ? campaign.id : undefined,
    title: campaign.title,
    description: campaign.description,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    terms: campaign.terms,
    platforms: campaign.platforms,
    minFollowers: campaign.minFollowers ?? null,
    basePoints: campaign.basePoints,
    pointsPerView: campaign.pointsPerView,
    pointsPerLike: campaign.pointsPerLike,
    pointsPerComment: campaign.pointsPerComment,
    maxPointsPerSubmission: campaign.maxPointsPerSubmission,
    requiresManualApproval: campaign.requiresManualApproval,
    status: campaign.status,
  });
}

export async function updateExperienceMetricsAction(
  submissionId: string,
  metrics: { views?: number; likes?: number; comments?: number; shares?: number }
) {
  return updateExperienceMetrics(submissionId, metrics);
}

export async function approveExperienceSubmissionAction(submissionId: string, points: number) {
  return approveExperienceSubmission(submissionId, points);
}

export async function rejectExperienceSubmissionAction(submissionId: string, reason: string) {
  return rejectExperienceSubmission(submissionId, reason);
}

export async function createExperienceSubmissionAction(
  input: Parameters<typeof import("@/lib/data/experience").createExperienceSubmission>[0]
) {
  const { createExperienceSubmission } = await import("@/lib/data/experience");
  return createExperienceSubmission(input);
}

```

# File: app/actions/loyalty.ts

```typescript
"use server";

import {
  deleteLoyaltyReward,
  getOwnerLoyalty,
  saveLoyaltySettings,
  upsertLoyaltyReward,
} from "@/lib/data/loyalty";
import type { LoyaltyReward, LoyaltySettings } from "@/lib/mock/loyalty";

export async function fetchOwnerLoyaltyAction() {
  return getOwnerLoyalty();
}

export async function saveLoyaltySettingsAction(settings: LoyaltySettings) {
  await saveLoyaltySettings({
    enabled: settings.enabled,
    pointsPerSar: settings.pointsPerSar,
    welcomePoints: settings.welcomePoints,
    earnRules: settings.earnRules,
    redemptionRules: settings.redemptionRules,
  });
}

export async function saveLoyaltyRewardAction(reward: LoyaltyReward) {
  return upsertLoyaltyReward({
    id: /^[0-9a-f-]{36}$/i.test(reward.id) ? reward.id : undefined,
    title: reward.title,
    points: reward.points,
    description: reward.description,
    active: reward.active,
  });
}

export async function deleteLoyaltyRewardAction(rewardId: string) {
  await deleteLoyaltyReward(rewardId);
}

```

# File: app/actions/marketing.ts

```typescript
"use server";

import {
  getOwnerMarketingCampaigns,
  softDeleteMarketingCampaign,
  upsertMarketingCampaign,
} from "@/lib/data/marketing";
import type { MarketingCampaign } from "@/lib/mock/marketing";

export async function fetchOwnerMarketingAction() {
  return getOwnerMarketingCampaigns();
}

export async function saveMarketingCampaignAction(campaign: MarketingCampaign) {
  return upsertMarketingCampaign({
    id: /^[0-9a-f-]{36}$/i.test(campaign.id) ? campaign.id : undefined,
    title: campaign.title,
    channel: campaign.channel,
    status: campaign.status,
    imageStoragePath: campaign.imageAssetId ?? null,
    payload: {
      audience: campaign.audience,
      message: campaign.message,
      code: campaign.code,
      discountPercent: campaign.discountPercent,
      influencerName: campaign.influencerName,
      influencerPhone: campaign.influencerPhone,
      commissionPercent: campaign.commissionPercent,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      visits: campaign.visits,
      conversions: campaign.conversions,
    },
  });
}

export async function deleteMarketingCampaignAction(campaignId: string) {
  await softDeleteMarketingCampaign(campaignId);
}

```

# File: app/actions/menu.ts

```typescript
"use server";

import {
  getOwnerMenu,
  saveAllMenuCategories,
  softDeleteMenuProduct,
  upsertMenuCategory,
  upsertMenuProduct,
} from "@/lib/data/menu";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { MenuProduct } from "@/lib/mock/menu";

export async function fetchOwnerMenuAction() {
  return getOwnerMenu();
}

export async function saveMenuProductAction(product: MenuProduct) {
  const row = await upsertMenuProduct({
    id: /^[0-9a-f-]{36}$/i.test(product.id) ? product.id : undefined,
    name: product.name,
    categoryId: product.categoryId ?? null,
    category: product.category,
    description: product.description,
    price: product.price,
    calories: product.calories ?? null,
    loyaltyPoints: product.loyaltyPoints,
    preparationTimeMinutes: product.preparationTimeMinutes ?? null,
    redeemableWithPoints: product.redeemableWithPoints ?? false,
    redemptionPoints: product.redemptionPoints ?? null,
    availableForPickup: product.availableForPickup ?? true,
    pickupLeadTimeMinutes: product.pickupLeadTimeMinutes ?? null,
    ingredients: product.ingredients,
    available: product.available,
    imageVariant: product.imageVariant,
    imageStoragePath: product.imageAssetId ?? null,
    promo: product.promo ?? null,
  });
  return row.id;
}

export async function deleteMenuProductAction(productId: string) {
  await softDeleteMenuProduct(productId);
}

export async function saveMenuCategoriesAction(categories: MenuCategoryRecord[]) {
  return saveAllMenuCategories(categories);
}

export async function saveMenuCategoryAction(category: MenuCategoryRecord) {
  return upsertMenuCategory({
    id: /^[0-9a-f-]{36}$/i.test(category.id) ? category.id : undefined,
    name: category.name,
    description: category.description,
    sortOrder: category.sortOrder,
    visible: category.visible,
    featured: category.featured,
    icon: category.icon,
    imageStoragePath: category.imageAssetId ?? null,
  });
}

```

# File: app/actions/notifications.ts

```typescript
"use server";

import {
  getOwnerCafeNotifications,
  markNotificationRead,
} from "@/lib/data/notifications";

export async function fetchOwnerNotificationsAction() {
  return getOwnerCafeNotifications();
}

export async function markNotificationReadAction(id: string) {
  await markNotificationRead(id);
}

```

# File: app/actions/offers.ts

```typescript
"use server";

import { getOwnerOffers, softDeleteOffer, upsertOffer } from "@/lib/data/offers";
import type { CafeOffer } from "@/lib/mock/offers";

export async function fetchOwnerOffersAction() {
  return getOwnerOffers();
}

export async function saveOfferAction(offer: CafeOffer) {
  return upsertOffer({
    id: /^[0-9a-f-]{36}$/i.test(offer.id) ? offer.id : undefined,
    title: offer.title,
    description: offer.description,
    type: offer.type,
    status: offer.status,
    placement: offer.placement,
    visibleInCafe: offer.visibleInCafe,
    discountPercent: offer.discountPercent ?? null,
    code: offer.code ?? null,
    startDate: offer.startDate ?? null,
    endDate: offer.endDate ?? null,
    linkedProductId: offer.linkedProductId ?? null,
    bannerStoragePath: offer.bannerAssetId ?? null,
    ctaText: offer.ctaText ?? null,
    promoPayload: {
      promoProductName: offer.promoProductName,
      promoProductPrice: offer.promoProductPrice,
      promoProductCategory: offer.promoProductCategory,
      promoProductDescription: offer.promoProductDescription,
    },
  });
}

export async function deleteOfferAction(offerId: string) {
  await softDeleteOffer(offerId);
}

```

# File: app/actions/orders.ts

```typescript
"use server";

import { getOwnerOrders, updateOrderStatus, createPickupOrder } from "@/lib/data/orders";
import type { OrderStatus } from "@/lib/mock/orders";
import {
  acceptPickupOrder,
  createCafeOrderFromProduct,
  rejectPickupOrder,
  type CreateOrderInput,
} from "@/lib/platform/order-flow";

export async function fetchOwnerOrdersAction() {
  return getOwnerOrders();
}

export async function updateOrderStatusAction(
  orderId: string,
  status: OrderStatus,
  rejectionReason?: string
) {
  await updateOrderStatus(orderId, status, rejectionReason);
}

export async function createCafeOrderAction(input: CreateOrderInput) {
  return createCafeOrderFromProduct(input);
}

export async function acceptPickupOrderAction(orderId: string, cafeSlug?: string) {
  return acceptPickupOrder(orderId, cafeSlug);
}

export async function rejectPickupOrderAction(
  orderId: string,
  reason: string,
  cafeSlug?: string
) {
  return rejectPickupOrder(orderId, reason, cafeSlug);
}

export async function createPickupOrderAction(
  input: Parameters<typeof createPickupOrder>[0]
) {
  return createPickupOrder(input);
}

```

# File: app/actions/pages.ts

```typescript
"use server";

import { deletePage, getOwnerPages, upsertPage } from "@/lib/data/pages";
import type { CafeInfoPage } from "@/lib/mock/cafe-pages";

export async function fetchOwnerPagesAction() {
  return getOwnerPages();
}

export async function savePageAction(page: CafeInfoPage) {
  return upsertPage({
    id: /^[0-9a-f-]{36}$/i.test(page.id) ? page.id : undefined,
    title: page.title,
    slug: page.slug,
    description: page.description,
    content: page.content,
    visible: page.visible,
  });
}

export async function deletePageAction(pageId: string) {
  await deletePage(pageId);
}

```

# File: app/actions/reservations.ts

```typescript
"use server";

import { getOwnerReservations, updateReservationStatus, createReservation } from "@/lib/data/reservations";
import type { ReservationStatus } from "@/lib/mock/reservations";
import {
  createReservationFlow,
  updateReservationStatus as updateReservationStatusFlow,
  type CreateReservationInput,
} from "@/lib/platform/reservation-flow";

export async function fetchOwnerReservationsAction() {
  return getOwnerReservations();
}

export async function updateReservationStatusAction(
  id: string,
  status: ReservationStatus,
  cafeMessage?: string,
  rejectionReason?: string
) {
  return updateReservationStatusFlow(id, status, { cafeMessage, rejectionReason });
}

export async function createReservationFlowAction(input: CreateReservationInput) {
  return createReservationFlow(input);
}

export async function createReservationAction(
  input: Parameters<typeof createReservation>[0]
) {
  return createReservation(input);
}

```

# File: app/actions/reviews.ts

```typescript
"use server";

import { getOwnerReviews, replyToReview } from "@/lib/data/reviews";

export async function fetchOwnerReviewsAction() {
  return getOwnerReviews();
}

export async function replyToReviewAction(reviewId: string, answer: string) {
  await replyToReview(reviewId, answer);
}

```

# File: app/actions/settings.ts

```typescript
"use server";

import { getOwnerCafeSettings, updateCafeSettings } from "@/lib/data/settings";
import type { CafeSettings } from "@/lib/mock/cafe-settings";

export async function fetchOwnerSettingsAction() {
  return getOwnerCafeSettings();
}

export async function saveSettingsAction(settings: CafeSettings) {
  await updateCafeSettings({
    ownerName: settings.ownerName,
    ownerEmail: settings.ownerEmail,
    ownerPhone: settings.ownerPhone,
    taxNumber: settings.taxNumber,
    commercialRegister: settings.commercialRegister,
    maroofCertificate: settings.maroofCertificate,
    instagram: settings.instagram,
    whatsapp: settings.whatsapp,
    description: settings.description,
    customDomain: settings.customDomain,
    domainStatus: settings.domainStatus,
    purchasedDomain: settings.purchasedDomain,
    purchasedDomainStatus: settings.purchasedDomainStatus,
    logoStoragePath: settings.logoAssetId ?? null,
  });
}

```

# File: app/actions/subscription.ts

```typescript
"use server";



import {

  completeOwnerPlanPayment,

  failOwnerPlanPayment,

  getOwnerPendingSubscription,

  getOwnerSubscriptionHistory,

  startOwnerPlanCheckout,

} from "@/lib/data/subscription";



export async function fetchOwnerSubscriptionHistoryAction() {

  return getOwnerSubscriptionHistory();

}



export async function fetchOwnerPendingSubscriptionAction() {

  return getOwnerPendingSubscription();

}



export async function startPlanCheckoutAction(planId: string) {

  return startOwnerPlanCheckout(planId);

}



export async function completePlanPaymentAction(subscriptionId?: string) {

  return completeOwnerPlanPayment(subscriptionId);

}



export async function failPlanPaymentAction() {

  await failOwnerPlanPayment();

}


```

# File: app/actions/theme.ts

```typescript
"use server";

import { updateOwnerThemeId, upsertCustomIdentity, getOwnerCustomIdentity } from "@/lib/data/theme";
import type { CafeThemeId } from "@/lib/mock/cafe-theme";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";

export async function adoptThemeAction(themeId: CafeThemeId) {
  await updateOwnerThemeId(themeId);
}

export async function saveCustomIdentityAction(identity: CustomIdentityTheme) {
  await upsertCustomIdentity({
    palette: identity.palette,
    backgroundScope: identity.backgroundScope,
    backgroundFit: identity.backgroundFit,
    overlayStrength: identity.overlayStrength,
    featuredSectionMode: identity.featuredSectionMode,
    featuredCategoryId: identity.featuredCategoryId ?? null,
    logoStoragePath: identity.logoAssetId ?? null,
    backgroundStoragePath: identity.backgroundAssetId ?? null,
  });
}

export async function fetchOwnerCustomIdentityAction() {
  return getOwnerCustomIdentity();
}

```

# File: app/actions/upload.ts

```typescript
"use server";

import { uploadOptimizedImage, type StorageBucket } from "@/lib/storage/upload-server";
import type { ImageAssetPurpose } from "@/lib/cafe/image-asset-pipeline";

const PURPOSE_MAP: Record<string, ImageAssetPurpose> = {
  logo: "cafe-logo",
  background: "custom-theme-background",
  product: "product-image",
  category: "category-image",
  "offer-banner": "offer-banner",
  marketing: "marketing-image",
  avatar: "customer-avatar",
};

export async function uploadImageAction(
  bucket: StorageBucket,
  formData: FormData,
  purpose: "logo" | "background" | "product" | "category" | "offer-banner" | "marketing" | "avatar",
  pathPrefix: string
) {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Missing file");
  }
  return uploadOptimizedImage(bucket, file, PURPOSE_MAP[purpose], pathPrefix);
}

```

# File: app/admin/cafes/page.tsx

```tsx
import { AdminCafesPage } from "@/components/admin/pages/admin-cafes-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import {
  getAdminCafes,
  getAdminCustomers,
  getAdminOperations,
  getPlatformPlans,
} from "@/lib/data/admin";
import {
  mockPlatformCafes,
  mockPlatformCustomers,
  mockPlatformOperations,
  mockPlatformPlans,
} from "@/lib/platform/admin-data";

export default async function AdminCafesRoutePage() {
  if (!isSupabaseConfigured()) {
    return (
      <AdminCafesPage
        initialCafes={mockPlatformCafes}
        initialPlans={mockPlatformPlans}
        initialCustomers={mockPlatformCustomers}
        initialOperations={mockPlatformOperations}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const [cafes, plans, customers, operations] = await Promise.all([
      getAdminCafes(),
      getPlatformPlans(),
      getAdminCustomers(),
      getAdminOperations(),
    ]);
    return (
      <AdminCafesPage
        initialCafes={cafes}
        initialPlans={plans}
        initialCustomers={customers}
        initialOperations={operations}
      />
    );
  } catch {
    return (
      <AdminCafesPage
        initialCafes={[]}
        initialPlans={mockPlatformPlans}
        initialCustomers={[]}
        initialOperations={[]}
        configError="تعذر تحميل الكوفيهات"
      />
    );
  }
}

```

# File: app/admin/customers/page.tsx

```tsx
import { AdminCustomersPage } from "@/components/admin/pages/admin-customers-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getAdminCustomers } from "@/lib/data/admin";
import { mockPlatformCustomers } from "@/lib/platform/admin-data";

export default async function AdminCustomersRoutePage() {
  if (!isSupabaseConfigured()) {
    return (
      <AdminCustomersPage
        initialCustomers={mockPlatformCustomers}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const customers = await getAdminCustomers();
    return <AdminCustomersPage initialCustomers={customers} />;
  } catch {
    return (
      <AdminCustomersPage initialCustomers={[]} configError="تعذر تحميل العملاء" />
    );
  }
}

```

# File: app/admin/layout.tsx

```tsx
import { AdminAppLayout } from "@/components/admin/admin-app-layout";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <main dir="rtl" className="min-h-screen overflow-x-hidden bg-[#0f0c0a] text-[#F8F4EF]">
      <AdminAppLayout>{children}</AdminAppLayout>
    </main>
  );
}

```

# File: app/admin/operations/page.tsx

```tsx
import { AdminOperationsPage } from "@/components/admin/pages/admin-operations-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getAdminOperations } from "@/lib/data/admin";
import { mockPlatformOperations } from "@/lib/platform/admin-data";

export default async function AdminOperationsRoutePage() {
  if (!isSupabaseConfigured()) {
    return (
      <AdminOperationsPage
        initialOperations={mockPlatformOperations}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const operations = await getAdminOperations();
    return <AdminOperationsPage initialOperations={operations} />;
  } catch {
    return (
      <AdminOperationsPage initialOperations={[]} configError="تعذر تحميل العمليات" />
    );
  }
}

```

# File: app/admin/options/page.tsx

```tsx
import { AdminOptionsPage } from "@/components/admin/pages/admin-options-page";

import { isSupabaseConfigured } from "@/lib/branda/env";

import { getPlatformPlans } from "@/lib/data/admin";

import { getPlatformSettings } from "@/lib/data/platform-settings";

import { mockPlatformOptions, mockPlatformPlans } from "@/lib/platform/admin-data";



export default async function AdminOptionsRoutePage() {

  if (!isSupabaseConfigured()) {

    return (

      <AdminOptionsPage

        initialOptions={mockPlatformOptions}

        initialPlans={mockPlatformPlans}

        configError="قم بإعداد Supabase في .env.local"

      />

    );

  }



  try {

    const [plans, settings] = await Promise.all([getPlatformPlans(), getPlatformSettings()]);

    return (

      <AdminOptionsPage

        initialOptions={settings ?? mockPlatformOptions}

        initialPlans={plans.length ? plans : mockPlatformPlans}

      />

    );

  } catch {

    return (

      <AdminOptionsPage

        initialOptions={mockPlatformOptions}

        initialPlans={mockPlatformPlans}

        configError="تعذر تحميل خيارات المنصة"

      />

    );

  }

}


```

# File: app/admin/page.tsx

```tsx
import { AdminHomePage } from "@/components/admin/pages/admin-home-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getAdminCafes, getAdminCustomers, getAdminOperations } from "@/lib/data/admin";
import {
  mockPlatformCafes,
  mockPlatformCustomers,
  mockPlatformOperations,
} from "@/lib/platform/admin-data";

export default async function AdminPage() {
  if (!isSupabaseConfigured()) {
    return (
      <AdminHomePage
        initialCafes={mockPlatformCafes}
        initialCustomers={mockPlatformCustomers}
        initialOperations={mockPlatformOperations}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const [cafes, customers, operations] = await Promise.all([
      getAdminCafes(),
      getAdminCustomers(),
      getAdminOperations(),
    ]);
    return (
      <AdminHomePage
        initialCafes={cafes}
        initialCustomers={customers}
        initialOperations={operations}
      />
    );
  } catch {
    return (
      <AdminHomePage
        initialCafes={[]}
        initialCustomers={[]}
        initialOperations={[]}
        configError="تعذر تحميل بيانات المنصة"
      />
    );
  }
}

```

# File: app/admin/plans/page.tsx

```tsx
import { AdminPlansPage } from "@/components/admin/pages/admin-plans-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getPlatformPlans } from "@/lib/data/admin";
import { mockPlatformPlans } from "@/lib/platform/admin-data";

export default async function AdminPlansRoutePage() {
  if (!isSupabaseConfigured()) {
    return (
      <AdminPlansPage initialPlans={mockPlatformPlans} configError="قم بإعداد Supabase في .env.local" />
    );
  }

  try {
    const plans = await getPlatformPlans();
    return <AdminPlansPage initialPlans={plans.length ? plans : mockPlatformPlans} />;
  } catch {
    return (
      <AdminPlansPage initialPlans={mockPlatformPlans} configError="تعذر تحميل الباقات" />
    );
  }
}

```

# File: app/admin/revenue/page.tsx

```tsx
import { AdminRevenuePage } from "@/components/admin/pages/admin-revenue-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getAdminCafes } from "@/lib/data/admin";
import { mockPlatformCafes } from "@/lib/platform/admin-data";

export default async function AdminRevenueRoutePage() {
  if (!isSupabaseConfigured()) {
    return (
      <AdminRevenuePage initialCafes={mockPlatformCafes} configError="قم بإعداد Supabase في .env.local" />
    );
  }

  try {
    const cafes = await getAdminCafes();
    return <AdminRevenuePage initialCafes={cafes} />;
  } catch {
    return <AdminRevenuePage initialCafes={[]} configError="تعذر تحميل بيانات الإيرادات" />;
  }
}

```

# File: app/api/domains/availability/route.ts

```typescript
import { NextResponse } from "next/server";
import { resolveAvailability } from "@/lib/platform/domain-purchase-server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { domain?: string };
    if (!body.domain) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }
    const result = await resolveAvailability(body.domain);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to check availability" },
      { status: 400 }
    );
  }
}

```

# File: app/api/domains/buy/route.ts

```typescript
import { NextResponse } from "next/server";
import { purchaseDomain } from "@/lib/platform/domain-purchase-server";
import { requireCafeOwnerForSlug } from "@/lib/data/domain-orders";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      cafeSlug?: string;
      domain?: string;
      years?: number;
      autoRenew?: boolean;
      price?: number;
      currency?: string;
    };

    if (!body.cafeSlug || !body.domain) {
      return NextResponse.json({ error: "cafeSlug and domain are required" }, { status: 400 });
    }

    await requireCafeOwnerForSlug(body.cafeSlug);

    const result = await purchaseDomain({
      cafeSlug: body.cafeSlug,
      domain: body.domain,
      years: body.years ?? 1,
      autoRenew: Boolean(body.autoRenew),
      price: body.price,
      currency: body.currency,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to buy domain";
    const status = message.includes("Unauthorized") || message.includes("Forbidden") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

```

# File: app/api/domains/connect/route.ts

```typescript
import { NextResponse } from "next/server";
import { connectDomainToProject } from "@/lib/platform/domain-purchase-server";
import { requireCafeOwnerForSlug } from "@/lib/data/domain-orders";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { domain?: string; cafeSlug?: string };
    if (!body.domain || !body.cafeSlug) {
      return NextResponse.json({ error: "domain and cafeSlug are required" }, { status: 400 });
    }
    await requireCafeOwnerForSlug(body.cafeSlug);
    const result = await connectDomainToProject(body.domain);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to connect domain";
    const status = message.includes("Unauthorized") || message.includes("Forbidden") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

```

# File: app/api/domains/price/route.ts

```typescript
import { NextResponse } from "next/server";
import { resolvePrice } from "@/lib/platform/domain-purchase-server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { domain?: string; years?: number };
    if (!body.domain) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }
    const result = await resolvePrice(body.domain, body.years ?? 1);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to get price" },
      { status: 400 }
    );
  }
}

```

# File: app/api/domains/search/route.ts

```typescript
import { NextResponse } from "next/server";
import { resolveAvailability, resolvePrice } from "@/lib/platform/domain-purchase-server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { domain?: string; years?: number };
    if (!body.domain) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }

    const [availability, price] = await Promise.all([
      resolveAvailability(body.domain),
      resolvePrice(body.domain, body.years ?? 1),
    ]);

    return NextResponse.json({
      domain: availability.domain,
      tld: availability.tld,
      available: availability.available,
      supportedTld: availability.supportedTld,
      availabilityStatus: availability.status,
      years: price.years,
      price: price.price,
      currency: price.currency,
      message: availability.message ?? price.message,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "search failed" },
      { status: 400 }
    );
  }
}

```

# File: app/api/domains/status/route.ts

```typescript
import { NextResponse } from "next/server";
import { resolveDomainStatus } from "@/lib/platform/domain-purchase-server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { domain?: string };
    if (!body.domain) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }
    const result = await resolveDomainStatus(body.domain);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to check status" },
      { status: 400 }
    );
  }
}

```

# File: app/api/public/cafe/[slug]/menu/route.ts

```typescript
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getPublicMenuBySlug } from "@/lib/data/menu";
import { getPublicOffersBySlug } from "@/lib/data/offers";
import { getPublicBranchesBySlug } from "@/lib/data/branches";
import { getPublicLoyaltyBySlug } from "@/lib/data/loyalty";
import { getPublicCafeSettings } from "@/lib/data/settings";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { slug } = await params;

  try {
    const settings = await getPublicCafeSettings(slug);
    if (!settings) {
      return NextResponse.json({ error: "Cafe not found" }, { status: 404 });
    }

    const [menu, offers, branches, loyalty] = await Promise.all([
      getPublicMenuBySlug(slug),
      getPublicOffersBySlug(slug),
      getPublicBranchesBySlug(slug),
      getPublicLoyaltyBySlug(slug),
    ]);

    return NextResponse.json({
      ...menu,
      offers,
      branches,
      loyaltySettings: loyalty.settings,
      loyaltyRewards: loyalty.rewards,
    });
  } catch (err) {
    console.error("[public/menu]", err);
    return NextResponse.json({ error: "Failed to load menu" }, { status: 500 });
  }
}

```

# File: app/api/public/cafe/[slug]/route.ts

```typescript
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicCustomIdentity, getPublicThemeId } from "@/lib/data/theme";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { slug } = await params;

  try {
    const [settings, themeId, customIdentity] = await Promise.all([
      getPublicCafeSettings(slug),
      getPublicThemeId(slug),
      getPublicCustomIdentity(slug),
    ]);

    if (!settings) {
      return NextResponse.json({ error: "Cafe not found" }, { status: 404 });
    }

    return NextResponse.json({ settings, themeId, customIdentity });
  } catch (err) {
    console.error("[public/cafe]", err);
    return NextResponse.json({ error: "Failed to load cafe" }, { status: 500 });
  }
}

```

# File: app/api/public/storage/route.ts

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ANON_PUBLIC_STORAGE_BUCKETS,
  assertAnonPublicStorageAccess,
  isAnonPublicStorageBucket,
  isPrivateStorageBucketName,
} from "@/lib/storage/public-storage-access";
import { PRIVATE_STORAGE_TTL_SECONDS } from "@/lib/storage/resolve-storage-url";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({
  bucket: z.string().min(1),
  path: z.string().min(1),
});

/**
 * Anonymous public signed URLs for published cafe assets only.
 * Never serves customer-avatars or experience-submissions.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    bucket: url.searchParams.get("bucket"),
    path: url.searchParams.get("path"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid bucket or path" }, { status: 400 });
  }

  const { bucket, path } = parsed.data;

  if (isPrivateStorageBucketName(bucket)) {
    return NextResponse.json(
      { error: "Private bucket requires authenticated session" },
      { status: 403 }
    );
  }

  if (!isAnonPublicStorageBucket(bucket)) {
    return NextResponse.json({ error: "Unknown or disallowed bucket" }, { status: 400 });
  }

  const supabase = await createClient();
  const access = await assertAnonPublicStorageAccess(supabase, bucket, path);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, PRIVATE_STORAGE_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Forbidden or not found" }, { status: 403 });
  }

  return NextResponse.json({
    url: data.signedUrl,
    expiresIn: PRIVATE_STORAGE_TTL_SECONDS,
    bucket,
    allowedBuckets: ANON_PUBLIC_STORAGE_BUCKETS,
  });
}

```

# File: app/api/storage/signed/route.ts

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertPrivateStorageAccess } from "@/lib/storage/private-storage-access";
import { isPrivateStorageBucketName } from "@/lib/storage/public-storage-access";
import { PRIVATE_STORAGE_TTL_SECONDS } from "@/lib/storage/resolve-storage-url";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({
  bucket: z.enum(["customer-avatars", "experience-submissions"]),
  path: z.string().min(1),
});

/**
 * Authenticated signed URLs for private buckets only.
 * Requires real Supabase session + DB-backed ownership/permission check.
 * TTL max 600 seconds. No service role.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    bucket: url.searchParams.get("bucket"),
    path: url.searchParams.get("path"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid bucket or path" }, { status: 400 });
  }

  const { bucket, path } = parsed.data;

  if (!isPrivateStorageBucketName(bucket)) {
    return NextResponse.json({ error: "Bucket not allowed on this endpoint" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const access = await assertPrivateStorageAccess(supabase, user, bucket, path);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, PRIVATE_STORAGE_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Forbidden or not found" }, { status: 403 });
  }

  return NextResponse.json({
    url: data.signedUrl,
    expiresIn: PRIVATE_STORAGE_TTL_SECONDS,
  });
}

```

# File: app/auth/callback/route.ts

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

```

# File: app/c/[slug]/account/page.tsx

```tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import { ExperienceCampaignSection } from "@/components/cafe/experience-campaign-section";
import { ThemedAccountPanel } from "@/components/cafe/themes/themed-account-panel";
import { appendPreviewToNextPath } from "@/lib/cafe/theme-links";
import {
  ImagePipelineError,
  optimizeImageForStorage,
  type OptimizedImageResult,
} from "@/lib/cafe/image-asset-pipeline";
import { revokeObjectUrl } from "@/lib/cafe/local-asset-store";
import {
  clearCustomerSession,
  getCustomerSession,
  type BrandaCustomerSession,
} from "@/lib/customer/session";
import {
  updateCustomerProfileAction,
  uploadCustomerAvatarAction,
} from "@/app/actions/customer-media";
import {
  type CustomerInvoice,
  type CustomerOrder,
  type CustomerTransaction,
} from "@/lib/mock/customer-activity";
import { formatSar } from "@/lib/format";
import { getThemeExperience } from "@/lib/cafe/theme-experience";

type Reservation = {
  id: string;
  customerName: string;
  phone: string;
  customerId?: string;
  type: string;
  guests: number;
  date: string;
  time: string;
  status: string;
  notes?: string;
  createdAt: string;
};

type TabKey = "orders" | "reservations" | "transactions" | "invoices";

function AccountPageInner() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { experience, settings, path, previewThemeId, themeId } = useCafePageContext(slug);
  const fileRef = useRef<HTMLInputElement>(null);

  const defaultTab: TabKey =
    getThemeExperience(themeId).account === "lounge-reservations"
      ? "reservations"
      : "orders";

  const [customer, setCustomer] = useState<BrandaCustomerSession | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAvatarPreview, setEditAvatarPreview] = useState("");
  const [pendingAvatar, setPendingAvatar] = useState<OptimizedImageResult | null>(null);
  const [avatarAssetId, setAvatarAssetId] = useState<string | undefined>();
  const [optimizingAvatar, setOptimizingAvatar] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const session = await getCustomerSession(slug);
      if (cancelled) return;

      if (!session) {
        const next = appendPreviewToNextPath(`/c/${slug}/account`, previewThemeId);
        router.push(`${path("login")}?next=${encodeURIComponent(next)}`);
        return;
      }

      setCustomer(session);
      setEditName(session.fullName);
      setEditEmail(session.email || "");
      setEditAvatarPreview(session.avatarUrl || "");
      setAvatarAssetId(session.avatarAssetId);

      const { fetchCustomerOrdersAction, fetchCustomerReservationsAction } = await import(
        "@/app/actions/customer"
      );
      const [cafeOrders, cafeReservations] = await Promise.all([
        fetchCustomerOrdersAction(slug),
        fetchCustomerReservationsAction(slug),
      ]);

      if (cancelled) return;

      setOrders(
        cafeOrders.map((o) => ({
          id: o.id,
          cafeSlug: slug,
          customerId: o.customerId,
          customerName: o.customerName,
          status: o.status,
          items: o.items.map((item) => `${item.name} × ${item.quantity}`),
          total: o.total,
          createdAt: o.createdAt,
          branchName: o.branchName,
          pickupAt: o.pickupAt,
          notes: o.notes,
        }))
      );
      setReservations(
        cafeReservations.map((r) => ({
          id: r.id,
          customerName: r.customerName,
          phone: r.phone,
          customerId: r.customerId,
          type: r.type,
          guests: r.guests,
          date: r.date,
          time: r.time,
          status: r.status,
          notes: r.notes,
          createdAt: r.createdAt,
        }))
      );
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router, slug, path, previewThemeId]);

  const myOrders = useMemo(
    () => orders.filter((order) => order.customerId === customer?.id),
    [orders, customer]
  );

  const myInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.customerId === customer?.id),
    [invoices, customer]
  );

  const myTransactions = useMemo(
    () => transactions.filter((item) => item.customerId === customer?.id),
    [transactions, customer]
  );

  const myReservations = useMemo(
    () =>
      reservations.filter(
        (reservation) =>
          reservation.customerId === customer?.id ||
          reservation.phone === customer?.phone
      ),
    [reservations, customer]
  );

  const loyaltyBalance = useMemo(
    () => myTransactions.reduce((sum, item) => sum + (item.points || 0), 0),
    [myTransactions]
  );

  const totalInvoices = useMemo(
    () => myInvoices.reduce((sum, invoice) => sum + invoice.amount, 0),
    [myInvoices]
  );

  const latestActivity = useMemo(() => {
    const orderActivities = myOrders.map((order) => ({
      id: order.id,
      title: `طلب: ${order.items.join("، ")}`,
      desc: `${order.status} • ${formatSar(order.total)}`,
      date: order.createdAt,
      type: "طلب",
    }));

    const reservationActivities = myReservations.map((reservation) => ({
      id: reservation.id,
      title: `حجز ${reservation.type}`,
      desc: `${reservation.status} • ${reservation.date} • ${reservation.time}`,
      date: reservation.createdAt,
      type: "حجز",
    }));

    const transactionActivities = myTransactions.map((transaction) => ({
      id: transaction.id,
      title: transaction.title,
      desc: transaction.description,
      date: transaction.createdAt,
      type: transaction.type,
    }));

    return [...orderActivities, ...reservationActivities, ...transactionActivities]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 4);
  }, [myOrders, myReservations, myTransactions]);

  function logout() {
    clearCustomerSession(slug);
    router.push(path());
  }

  async function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setOptimizingAvatar(true);
    try {
      const optimized = await optimizeImageForStorage(file, "customer-avatar");
      if (editAvatarPreview.startsWith("blob:")) revokeObjectUrl(editAvatarPreview);
      setEditAvatarPreview(URL.createObjectURL(optimized.blob));
      setPendingAvatar(optimized);
    } catch (err) {
      alert(
        err instanceof ImagePipelineError
          ? err.message
          : "تعذر قراءة الصورة، جرّب ملف PNG أو JPG أو WEBP"
      );
    } finally {
      setOptimizingAvatar(false);
    }
  }

  async function saveSettings() {
    if (!editName.trim()) {
      alert("اكتب الاسم");
      return;
    }
    if (!customer) return;

    try {
      let session = customer;

      if (pendingAvatar) {
        const formData = new FormData();
        formData.append("file", pendingAvatar.blob, "avatar.webp");
        session = await uploadCustomerAvatarAction(slug, formData);
      }

      session = await updateCustomerProfileAction(slug, {
        fullName: editName.trim(),
        email: editEmail.trim() || undefined,
      });

      setCustomer(session);
      setPendingAvatar(null);
      setSettingsOpen(false);
      alert("تم حفظ بيانات الحساب");
    } catch {
      alert("تعذر حفظ بيانات الحساب");
    }
  }

  if (!customer) return null;

  return (
    <>
      <ThemedAccountPanel
        slug={slug}
        experience={experience}
        cafeName={settings.cafeName}
        homeHref={path()}
        customer={customer}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        myOrders={myOrders}
        myReservations={myReservations}
        myTransactions={myTransactions}
        myInvoices={myInvoices}
        loyaltyBalance={loyaltyBalance}
        totalInvoices={totalInvoices}
        latestActivity={latestActivity}
        onLogout={logout}
        onOpenSettings={() => {
          setEditName(customer.fullName);
          setEditEmail(customer.email || "");
          setEditAvatarPreview("");
          setAvatarAssetId(customer.avatarAssetId);
          setPendingAvatar(null);
          setSettingsOpen(true);
        }}
        settingsOpen={settingsOpen}
        onCloseSettings={() => setSettingsOpen(false)}
        editName={editName}
        editEmail={editEmail}
        editAvatarPreview={editAvatarPreview}
        avatarAssetId={avatarAssetId}
        onEditName={setEditName}
        onEditEmail={setEditEmail}
        onPickAvatar={pickAvatar}
        onClearAvatar={() => {
          if (editAvatarPreview.startsWith("blob:")) revokeObjectUrl(editAvatarPreview);
          setEditAvatarPreview("");
          setPendingAvatar(null);
          setAvatarAssetId(undefined);
        }}
        onSaveSettings={() => void saveSettings()}
        fileRef={fileRef}
      />
      <ExperienceCampaignSection slug={slug} compact />
    </>
  );
}

export default function CafeCustomerAccountPage() {
  const params = useParams<{ slug: string }>();
  return (
    <CafeLayout slug={params.slug} className="!px-0 !py-0" maxWidth="max-w-[100%]">
      <Suspense fallback={<p className="p-8 text-center font-black">جاري التحميل...</p>}>
        <AccountPageInner />
      </Suspense>
    </CafeLayout>
  );
}

```

# File: app/c/[slug]/login/page.tsx

```tsx
"use client";



import { useParams, useRouter, useSearchParams } from "next/navigation";

import { Suspense, useState } from "react";

import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";

import {

  ThemedAuthPanel,

  ThemedInput,

} from "@/components/cafe/themes/themed-auth-panel";

import { appendPreviewToNextPath } from "@/lib/cafe/theme-links";

import { loginCustomerAction } from "@/app/actions/auth";



function LoginForm() {

  const router = useRouter();

  const params = useParams<{ slug: string }>();

  const searchParams = useSearchParams();

  const slug = params.slug;

  const rawNext = searchParams.get("next") || `/c/${slug}`;

  const { settings, experience, path, previewThemeId } = useCafePageContext(slug);



  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);



  function login() {

    if (!email.trim() || !password.trim()) {

      alert("اكتب البريد وكلمة المرور");

      return;

    }

    setLoading(true);

    void loginCustomerAction(slug, email.trim(), password).then((result) => {

      setLoading(false);

      if (!result.ok) {

        alert(result.message);

        return;

      }

      router.push(appendPreviewToNextPath(rawNext, previewThemeId));

    });

  }



  const nextForRegister = appendPreviewToNextPath(rawNext, previewThemeId);



  return (

    <ThemedAuthPanel

      mode="login"

      settings={settings}

      experience={experience}

      registerHref={`${path("register")}?next=${encodeURIComponent(nextForRegister)}`}

      loginHref={path("login")}

      onSubmit={login}

      submitLabel={loading ? "جاري الدخول..." : "دخول ومتابعة"}

    >

      <ThemedInput

        experience={experience}

        value={email}

        onChange={(e) => setEmail(e.target.value)}

        placeholder="البريد الإلكتروني"

        type="email"

      />

      <ThemedInput

        experience={experience}

        value={password}

        onChange={(e) => setPassword(e.target.value)}

        placeholder="كلمة المرور"

        type="password"

      />

    </ThemedAuthPanel>

  );

}



export default function CafeCustomerLoginPage() {

  const params = useParams<{ slug: string }>();

  return (

    <CafeLayout slug={params.slug} className="max-w-lg py-8" maxWidth="max-w-lg">

      <Suspense fallback={<p className="text-center font-black">جاري التحميل...</p>}>

        <LoginForm />

      </Suspense>

    </CafeLayout>

  );

}


```

# File: app/c/[slug]/page.tsx

```tsx
import { CafePageClient } from "@/components/cafe/cafe-page-client";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function CafePage({ params }: Props) {
  const { slug } = await params;

  return <CafePageClient slug={slug} />;
}
```

# File: app/c/[slug]/product/[id]/page.tsx

```tsx
import { ProductDetailClient } from "@/components/cafe/product-detail-client";

type Props = {
  params: Promise<{
    slug: string;
    id: string;
  }>;
};

export default async function ProductDetailPage({ params }: Props) {
  const { slug, id } = await params;

  return <ProductDetailClient slug={slug} id={id} />;
}
```

# File: app/c/[slug]/products/[view]/page.tsx

```tsx
import { Suspense } from "react";
import { ProductCollectionPage } from "@/components/cafe/product-collection-page";

type Props = {
  params: Promise<{
    slug: string;
    view: string;
  }>;
};

export default async function CafeProductCollection({ params }: Props) {
  const { slug, view } = await params;

  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ProductCollectionPage slug={slug} view={view} />
    </Suspense>
  );
}
```

# File: app/c/[slug]/register/page.tsx

```tsx
"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import {
  ThemedAuthPanel,
  ThemedInput,
} from "@/components/cafe/themes/themed-auth-panel";
import { appendPreviewToNextPath } from "@/lib/cafe/theme-links";
import { registerCustomerAction } from "@/app/actions/auth";

function RegisterForm() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = params.slug;
  const rawNext = searchParams.get("next") || `/c/${slug}`;
  const { settings, experience, path, previewThemeId } = useCafePageContext(slug);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  function register() {
    if (!fullName.trim() || !phone.trim() || !email.trim() || !password.trim()) {
      alert("اكتب الاسم ورقم الجوال والبريد وكلمة المرور");
      return;
    }
    if (password.length < 8) {
      alert("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
      return;
    }
    setLoading(true);
    void registerCustomerAction(slug, email.trim(), password, fullName.trim(), phone.trim()).then(
      (result) => {
        setLoading(false);
        if (!result.ok) {
          alert(result.message);
          return;
        }
        router.push(appendPreviewToNextPath(rawNext, previewThemeId));
      }
    );
  }

  const nextForLogin = appendPreviewToNextPath(rawNext, previewThemeId);

  return (
    <ThemedAuthPanel
      mode="register"
      settings={settings}
      experience={experience}
      registerHref={path("register")}
      loginHref={`${path("login")}?next=${encodeURIComponent(nextForLogin)}`}
      onSubmit={register}
      submitLabel={loading ? "جاري التسجيل..." : "إنشاء الحساب"}
    >
      <ThemedInput
        experience={experience}
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder="الاسم الكامل"
      />
      <ThemedInput
        experience={experience}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="رقم الجوال"
      />
      <ThemedInput
        experience={experience}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="البريد الإلكتروني"
        type="email"
      />
      <ThemedInput
        experience={experience}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="كلمة المرور (8 أحرف على الأقل)"
        type="password"
      />
    </ThemedAuthPanel>
  );
}

export default function CafeCustomerRegisterPage() {
  const params = useParams<{ slug: string }>();
  return (
    <CafeLayout slug={params.slug} className="max-w-lg py-8" maxWidth="max-w-lg">
      <Suspense fallback={<p className="text-center font-black">جاري التحميل...</p>}>
        <RegisterForm />
      </Suspense>
    </CafeLayout>
  );
}

```

# File: app/c/[slug]/reserve/page.tsx

```tsx
"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { createReservationFlowAction } from "@/app/actions/reservations";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import { ThemedInput } from "@/components/cafe/themes/themed-auth-panel";
import {
  ReservationEventFields,
  ThemedReservationPanel,
  ThemedSelect,
  ThemedTextarea,
} from "@/components/cafe/themes/themed-reservation-panel";
import { usePublicCafeMenu } from "@/lib/cafe/use-public-cafe-menu";
import { getCustomerSession, type BrandaCustomerSession } from "@/lib/customer/session";
import type { CafeBranch } from "@/lib/mock/branches";
import {
  RESERVATION_EVENT_TYPES,
  type ReservationEventType,
} from "@/lib/mock/reservations";
import { appendPreviewToNextPath } from "@/lib/cafe/theme-links";

function ReserveForm() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { settings, experience, path, previewThemeId, theme } = useCafePageContext(slug);
  const { branches, loading, error } = usePublicCafeMenu(slug);

  const [customer, setCustomer] = useState<BrandaCustomerSession | null>(null);
  const [branchId, setBranchId] = useState("");
  const [reservationType, setReservationType] =
    useState<ReservationEventType>("طاولة عادية");
  const [guests, setGuests] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [spaceType, setSpaceType] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [needsDecoration, setNeedsDecoration] = useState(false);
  const [needsCatering, setNeedsCatering] = useState(false);
  const [budgetEstimate, setBudgetEstimate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void getCustomerSession(slug).then(setCustomer);
  }, [slug]);

  useEffect(() => {
    const active = branches.filter((b: CafeBranch) => b.active);
    if (active[0] && !branchId) setBranchId(active[0].id);
  }, [branches, branchId]);

  const activeBranches = branches.filter((b) => b.active);
  const selectedBranch = activeBranches.find((b) => b.id === branchId);

  const isSpecialEvent = useMemo(
    () =>
      reservationType !== "طاولة عادية" && reservationType !== "اجتماع",
    [reservationType]
  );

  async function submitReservation() {
    if (!customer) {
      router.push(
        `${path("login")}?next=${encodeURIComponent(appendPreviewToNextPath(`/c/${slug}/reserve`, previewThemeId))}`
      );
      return;
    }
    if (!branchId || !guests || !date || !time) {
      alert("اختر الفرع والتاريخ والوقت وعدد الأشخاص");
      return;
    }
    if (!selectedBranch) return;

    setSubmitting(true);
    try {
      await createReservationFlowAction({
        slug,
        customer,
        branch: selectedBranch,
        reservationType,
        guests: Number(guests) || 1,
        date,
        time,
        durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
        spaceType,
        eventTitle: isSpecialEvent ? eventTitle : undefined,
        needsDecoration: isSpecialEvent ? needsDecoration : undefined,
        needsCatering: isSpecialEvent ? needsCatering : undefined,
        budgetEstimate: budgetEstimate ? Number(budgetEstimate) : undefined,
        notes,
      });
      alert("تم إرسال طلب الحجز بنجاح");
      router.push(appendPreviewToNextPath(path("account"), previewThemeId));
    } catch {
      alert("تعذر إرسال الحجز. حاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <CafeLayout slug={slug}>
        <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
          <p className="font-black">جاري التحميل...</p>
        </div>
      </CafeLayout>
    );
  }

  if (error) {
    return (
      <CafeLayout slug={slug}>
        <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
          <p className="font-black">{error}</p>
        </div>
      </CafeLayout>
    );
  }

  const loginPrompt = !customer ? (
    <div className={`mt-4 rounded-2xl p-5 ${theme.card}`}>
      <p className="font-black">سجّل دخولك لإتمام الحجز.</p>
      <Link
        href={`${path("login")}?next=${encodeURIComponent(appendPreviewToNextPath(`/c/${slug}/reserve`, previewThemeId))}`}
        className={`mt-4 inline-flex rounded-2xl px-6 py-3 font-black ${theme.button}`}
      >
        تسجيل الدخول
      </Link>
    </div>
  ) : null;

  const form = customer ? (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <ThemedSelect experience={experience} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
        <option value="">اختر الفرع</option>
        {activeBranches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </ThemedSelect>

      <ThemedSelect
        experience={experience}
        value={reservationType}
        onChange={(e) => setReservationType(e.target.value as ReservationEventType)}
      >
        {RESERVATION_EVENT_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </ThemedSelect>

      <ThemedInput
        experience={experience}
        value={guests}
        onChange={(e) => setGuests(e.target.value)}
        placeholder="عدد الأشخاص"
        type="number"
        min={1}
      />
      <ThemedInput
        experience={experience}
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <ThemedInput
        experience={experience}
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
      />
      <ThemedInput
        experience={experience}
        value={durationMinutes}
        onChange={(e) => setDurationMinutes(e.target.value)}
        placeholder="مدة الجلسة (دقيقة) — اختياري"
        type="number"
        min={30}
      />

      {reservationType === "اجتماع" ? (
        <ThemedInput
          experience={experience}
          value={spaceType}
          onChange={(e) => setSpaceType(e.target.value)}
          placeholder="نوع المساحة (قاعة، طاولة طويلة...)"
          className="md:col-span-2"
        />
      ) : null}

      <ReservationEventFields
        experience={experience}
        theme={theme}
        reservationType={reservationType}
        eventTitle={eventTitle}
        onEventTitleChange={setEventTitle}
        needsDecoration={needsDecoration}
        onNeedsDecorationChange={setNeedsDecoration}
        needsCatering={needsCatering}
        onNeedsCateringChange={setNeedsCatering}
        budgetEstimate={budgetEstimate}
        onBudgetEstimateChange={setBudgetEstimate}
      />

      <ThemedTextarea
        experience={experience}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="ملاحظات إضافية"
        className="md:col-span-2 min-h-24"
      />
      <button
        type="button"
        onClick={() => void submitReservation()}
        disabled={submitting}
        className={`md:col-span-2 w-full font-black disabled:opacity-60 ${experience.reserve === "kiosk" ? "h-16 text-lg rounded-lg" : "h-14 rounded-2xl"} ${theme.button}`}
      >
        {submitting ? "جاري الإرسال..." : "إرسال طلب الحجز"}
      </button>
    </div>
  ) : null;

  return (
    <ThemedReservationPanel
      settings={settings}
      experience={experience}
      branchCount={activeBranches.length}
      loginPromptSlot={loginPrompt}
      formSlot={form}
    />
  );
}

export default function ReservePage() {
  const params = useParams<{ slug: string }>();
  return (
    <CafeLayout slug={params.slug}>
      <Suspense fallback={<p className="font-black">جاري التحميل...</p>}>
        <ReserveForm />
      </Suspense>
    </CafeLayout>
  );
}

```

# File: app/dashboard/branches/page.tsx

```tsx
import { BranchesPageClient } from "@/components/dashboard/pages/branches-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getOwnerBranches } from "@/lib/data/branches";

export default async function BranchesPage() {
  if (!isSupabaseConfigured()) {
    return <BranchesPageClient initialBranches={[]} configError="قم بإعداد Supabase في .env.local" />;
  }
  try {
    return <BranchesPageClient initialBranches={await getOwnerBranches()} />;
  } catch {
    return (
      <BranchesPageClient initialBranches={[]} configError="تعذر تحميل الفروع" />
    );
  }
}

```

# File: app/dashboard/customers/page.tsx

```tsx
import { CustomersPageClient } from "@/components/dashboard/pages/customers-page";

import { isSupabaseConfigured } from "@/lib/branda/env";

import { getOwnerCustomersDashboard } from "@/lib/data/customers";



export default async function CustomersPage() {

  if (!isSupabaseConfigured()) {

    return (

      <CustomersPageClient

        initialCustomers={[]}

        initialOrders={[]}

        initialReservations={[]}

        configError="قم بإعداد Supabase في .env.local"

      />

    );

  }



  try {

    const dashboard = await getOwnerCustomersDashboard();

    return (

      <CustomersPageClient

        initialCustomers={dashboard.customers}

        initialOrders={dashboard.orders}

        initialReservations={dashboard.reservations}

      />

    );

  } catch {

    return (

      <CustomersPageClient

        initialCustomers={[]}

        initialOrders={[]}

        initialReservations={[]}

        configError="تعذر تحميل العملاء"

      />

    );

  }

}


```

# File: app/dashboard/layout.tsx

```tsx
import { DashboardAppLayout } from "@/components/dashboard/dashboard-app-layout";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main dir="rtl" className="min-h-screen overflow-x-hidden bg-[#FCF8F3] text-[#311912]">
      <DashboardAppLayout>{children}</DashboardAppLayout>
    </main>
  );
}

```

# File: app/dashboard/loyalty/page.tsx

```tsx
import { LoyaltyPageClient } from "@/components/dashboard/pages/loyalty-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getOwnerLoyalty } from "@/lib/data/loyalty";

export default async function LoyaltyPage() {
  if (!isSupabaseConfigured()) {
    return (
      <LoyaltyPageClient
        initialSettings={{
          pointsPerSar: 1,
          welcomePoints: 0,
          enabled: true,
          earnRules: [],
          redemptionRules: [],
        }}
        initialRewards={[]}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }
  try {
    const { settings, rewards } = await getOwnerLoyalty();
    return <LoyaltyPageClient initialSettings={settings} initialRewards={rewards} />;
  } catch {
    return (
      <LoyaltyPageClient
        initialSettings={{
          pointsPerSar: 1,
          welcomePoints: 0,
          enabled: true,
          earnRules: [],
          redemptionRules: [],
        }}
        initialRewards={[]}
        configError="تعذر تحميل إعدادات الولاء"
      />
    );
  }
}

```

# File: app/dashboard/marketing/page.tsx

```tsx
import { MarketingPageClient } from "@/components/dashboard/pages/marketing-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getOwnerExperienceData } from "@/lib/data/experience";
import { getOwnerMarketingCampaigns } from "@/lib/data/marketing";

export default async function DashboardMarketingPage() {
  if (!isSupabaseConfigured()) {
    return (
      <MarketingPageClient
        initialCampaigns={[]}
        initialExpCampaigns={[]}
        initialSubmissions={[]}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const [campaigns, experience] = await Promise.all([
      getOwnerMarketingCampaigns(),
      getOwnerExperienceData(),
    ]);
    return (
      <MarketingPageClient
        initialCampaigns={campaigns}
        initialExpCampaigns={experience.campaigns}
        initialSubmissions={experience.submissions}
      />
    );
  } catch {
    return (
      <MarketingPageClient
        initialCampaigns={[]}
        initialExpCampaigns={[]}
        initialSubmissions={[]}
        configError="تعذر تحميل بيانات التسويق"
      />
    );
  }
}

```

# File: app/dashboard/menu/page.tsx

```tsx
import { MenuPageClient } from "@/components/dashboard/pages/menu-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getOwnerMenu } from "@/lib/data/menu";

export default async function DashboardMenuPage() {
  if (!isSupabaseConfigured()) {
    return (
      <MenuPageClient
        initialProducts={[]}
        initialCategories={[]}
        configError="قم بإعداد Supabase في .env.local ثم شغّل migration"
      />
    );
  }

  try {
    const { products, categories } = await getOwnerMenu();
    return <MenuPageClient initialProducts={products} initialCategories={categories} />;
  } catch {
    return (
      <MenuPageClient
        initialProducts={[]}
        initialCategories={[]}
        configError="تعذر تحميل المنيو — تأكد من تسجيل الدخول وربط المقهى"
      />
    );
  }
}
```

# File: app/dashboard/offers/page.tsx

```tsx
import { OffersPageClient } from "@/components/dashboard/pages/offers-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getOwnerMenu } from "@/lib/data/menu";
import { getOwnerOffers } from "@/lib/data/offers";

export default async function OffersPage() {
  if (!isSupabaseConfigured()) {
    return (
      <OffersPageClient initialOffers={[]} initialProducts={[]} configError="قم بإعداد Supabase في .env.local" />
    );
  }
  try {
    const [offers, menu] = await Promise.all([getOwnerOffers(), getOwnerMenu()]);
    return (
      <OffersPageClient initialOffers={offers} initialProducts={menu.products} />
    );
  } catch {
    return (
      <OffersPageClient initialOffers={[]} initialProducts={[]} configError="تعذر تحميل العروض" />
    );
  }
}

```

# File: app/dashboard/orders/page.tsx

```tsx
import { OrdersPageClient } from "@/components/dashboard/pages/orders-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getOwnerOrders } from "@/lib/data/orders";

export default async function OrdersPage() {
  if (!isSupabaseConfigured()) {
    return <OrdersPageClient initialOrders={[]} configError="قم بإعداد Supabase في .env.local" />;
  }

  try {
    const orders = await getOwnerOrders();
    return <OrdersPageClient initialOrders={orders} />;
  } catch {
    return (
      <OrdersPageClient
        initialOrders={[]}
        configError="تعذر تحميل الطلبات — تأكد من تسجيل الدخول"
      />
    );
  }
}

```

# File: app/dashboard/page.tsx

```tsx
import { DashboardHomeClient } from "@/components/dashboard/dashboard-home-client";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getCafeCustomers } from "@/lib/data/customers";
import { getOwnerOrders } from "@/lib/data/orders";
import { getOwnerReservations } from "@/lib/data/reservations";
import { requireOwnerCafeContext } from "@/lib/data/cafes";

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <DashboardHomeClient
        customers={[]}
        orders={[]}
        reservations={[]}
        cafeSlug="qatrah"
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const cafe = await requireOwnerCafeContext();
    const [orders, reservations, customerRows] = await Promise.all([
      getOwnerOrders(),
      getOwnerReservations(),
      getCafeCustomers(),
    ]);

    return (
      <DashboardHomeClient
        customers={customerRows.map((c) => ({
          id: c.id as string,
          cafeSlug: cafe.slug,
          fullName: c.full_name as string,
          phone: c.phone as string,
          email: (c.email as string) ?? undefined,
          createdAt: (c.created_at as string).slice(0, 10),
        }))}
        orders={orders}
        reservations={reservations}
        cafeSlug={cafe.slug}
      />
    );
  } catch {
    return (
      <DashboardHomeClient
        customers={[]}
        orders={[]}
        reservations={[]}
        cafeSlug="qatrah"
        configError="تعذر تحميل بيانات لوحة التحكم"
      />
    );
  }
}

```

# File: app/dashboard/pages/page.tsx

```tsx
import { PagesManagerPageClient } from "@/components/dashboard/pages/pages-manager-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getOwnerPages } from "@/lib/data/pages";

export default async function PagesManagerPage() {
  if (!isSupabaseConfigured()) {
    return <PagesManagerPageClient initialPages={[]} configError="قم بإعداد Supabase في .env.local" />;
  }
  try {
    return <PagesManagerPageClient initialPages={await getOwnerPages()} />;
  } catch {
    return <PagesManagerPageClient initialPages={[]} configError="تعذر تحميل الصفحات" />;
  }
}

```

# File: app/dashboard/reports/page.tsx

```tsx
import { ReportsPageClient } from "@/components/dashboard/pages/reports-page";

import { isSupabaseConfigured } from "@/lib/branda/env";

import { getOwnerCustomersDashboard } from "@/lib/data/customers";

import { getOwnerOrders } from "@/lib/data/orders";

import { getOwnerReservations } from "@/lib/data/reservations";

import { getOwnerReviews } from "@/lib/data/reviews";



export default async function ReportsPage() {

  if (!isSupabaseConfigured()) {

    return (

      <ReportsPageClient

        initialOrders={[]}

        initialCustomers={[]}

        initialReviews={[]}

        initialReservations={[]}

        configError="قم بإعداد Supabase في .env.local"

      />

    );

  }



  try {

    const [orders, dashboard, reviews, reservations] = await Promise.all([

      getOwnerOrders(),

      getOwnerCustomersDashboard(),

      getOwnerReviews(),

      getOwnerReservations(),

    ]);



    return (

      <ReportsPageClient

        initialOrders={orders}

        initialCustomers={dashboard.customers}

        initialReviews={reviews}

        initialReservations={reservations}

      />

    );

  } catch {

    return (

      <ReportsPageClient

        initialOrders={[]}

        initialCustomers={[]}

        initialReviews={[]}

        initialReservations={[]}

        configError="تعذر تحميل التقارير"

      />

    );

  }

}


```

# File: app/dashboard/reservations/page.tsx

```tsx
import { ReservationsPageClient } from "@/components/dashboard/pages/reservations-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getOwnerReservations } from "@/lib/data/reservations";

export default async function ReservationsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <ReservationsPageClient initialReservations={[]} configError="قم بإعداد Supabase في .env.local" />
    );
  }

  try {
    const reservations = await getOwnerReservations();
    return <ReservationsPageClient initialReservations={reservations} />;
  } catch {
    return (
      <ReservationsPageClient
        initialReservations={[]}
        configError="تعذر تحميل الحجوزات — تأكد من تسجيل الدخول"
      />
    );
  }
}

```

# File: app/dashboard/reviews/page.tsx

```tsx
import { ReviewsPageClient } from "@/components/dashboard/pages/reviews-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getOwnerReviews } from "@/lib/data/reviews";

export default async function ReviewsPage() {
  if (!isSupabaseConfigured()) {
    return <ReviewsPageClient initialReviews={[]} configError="قم بإعداد Supabase في .env.local" />;
  }
  try {
    return <ReviewsPageClient initialReviews={await getOwnerReviews()} />;
  } catch {
    return <ReviewsPageClient initialReviews={[]} configError="تعذر تحميل التقييمات" />;
  }
}

```

# File: app/dashboard/settings/page.tsx

```tsx
import { SettingsPageClient } from "@/components/dashboard/pages/settings-page";

import { isSupabaseConfigured } from "@/lib/branda/env";

import { getOwnerCafeSettings } from "@/lib/data/settings";



export default async function SettingsPage() {

  if (!isSupabaseConfigured()) {

    return (

      <SettingsPageClient

        initialSettings={{

          cafeSlug: "qatrah",

          cafeName: "كوفي",

          ownerName: "",

          ownerEmail: "",

          ownerPhone: "",

          description: "",

          domainStatus: "غير مربوط",

        }}

        configError="قم بإعداد Supabase في .env.local"

      />

    );

  }



  try {

    const settings = await getOwnerCafeSettings();

    return <SettingsPageClient initialSettings={settings} />;

  } catch {

    return (

      <SettingsPageClient

        initialSettings={{

          cafeSlug: "qatrah",

          cafeName: "كوفي",

          ownerName: "",

          ownerEmail: "",

          ownerPhone: "",

          description: "",

          domainStatus: "غير مربوط",

        }}

        configError="تعذر تحميل الإعدادات — تأكد من تسجيل الدخول"

      />

    );

  }

}


```

# File: app/dashboard/subscription/page.tsx

```tsx
import { SubscriptionPageClient } from "@/components/dashboard/pages/subscription-page";

import { isSupabaseConfigured } from "@/lib/branda/env";

import { getPlatformPlans, getOwnerActivePlanId } from "@/lib/data/admin";

import {

  getOwnerPendingSubscription,

  getOwnerSubscriptionHistory,

} from "@/lib/data/subscription";

import { mockPlatformPlans } from "@/lib/platform/admin-data";



export default async function SubscriptionPage() {

  if (!isSupabaseConfigured()) {

    return (

      <SubscriptionPageClient

        initialPlans={mockPlatformPlans}

        initialActivePlanId="pro"

        initialHistory={[]}

        initialPending={null}

        configError="قم بإعداد Supabase في .env.local"

      />

    );

  }



  try {

    const [plans, activePlanId, history, pending] = await Promise.all([

      getPlatformPlans(),

      getOwnerActivePlanId(),

      getOwnerSubscriptionHistory(),

      getOwnerPendingSubscription(),

    ]);



    return (

      <SubscriptionPageClient

        initialPlans={plans}

        initialActivePlanId={activePlanId}

        initialHistory={history}

        initialPending={pending}

      />

    );

  } catch {

    return (

      <SubscriptionPageClient

        initialPlans={mockPlatformPlans}

        initialActivePlanId="pro"

        initialHistory={[]}

        initialPending={null}

        configError="تعذر تحميل بيانات الاشتراك"

      />

    );

  }

}


```

# File: app/dashboard/theme/page.tsx

```tsx
import { ThemePageClient } from "@/components/dashboard/pages/theme-page";

import { isSupabaseConfigured } from "@/lib/branda/env";

import { getOwnerLoyalty } from "@/lib/data/loyalty";

import { getOwnerMenu } from "@/lib/data/menu";

import { getOwnerOffers } from "@/lib/data/offers";

import { getOwnerCafeSettings } from "@/lib/data/settings";

import { getOwnerCustomIdentity, getOwnerThemeId } from "@/lib/data/theme";

import { defaultCustomIdentityTheme } from "@/lib/mock/custom-identity-theme";



export default async function ThemePage() {

  if (!isSupabaseConfigured()) {

    return (

      <ThemePageClient

        initialThemeId="soft-cream-3d"

        initialSettings={{

          cafeSlug: "qatrah",

          cafeName: "كوفي",

          ownerName: "",

          ownerEmail: "",

          ownerPhone: "",

          description: "",

          domainStatus: "غير مربوط",

        }}

        initialProducts={[]}

        initialCategories={[]}

        initialOffers={[]}

        initialLoyaltySettings={{

          pointsPerSar: 1,

          welcomePoints: 0,

          enabled: true,

          earnRules: [],

          redemptionRules: [],

        }}

        initialLoyaltyRewards={[]}

        initialCustomIdentity={defaultCustomIdentityTheme()}

        configError="قم بإعداد Supabase في .env.local"

      />

    );

  }



  try {

    const [settings, themeId, menu, offers, loyalty, customIdentity] = await Promise.all([

      getOwnerCafeSettings(),

      getOwnerThemeId(),

      getOwnerMenu(),

      getOwnerOffers(),

      getOwnerLoyalty(),

      getOwnerCustomIdentity(),

    ]);



    return (

      <ThemePageClient

        initialThemeId={themeId}

        initialSettings={settings}

        initialProducts={menu.products}

        initialCategories={menu.categories}

        initialOffers={offers}

        initialLoyaltySettings={loyalty.settings}

        initialLoyaltyRewards={loyalty.rewards}

        initialCustomIdentity={customIdentity ?? defaultCustomIdentityTheme()}

      />

    );

  } catch {

    return (

      <ThemePageClient

        initialThemeId="soft-cream-3d"

        initialSettings={{

          cafeSlug: "qatrah",

          cafeName: "كوفي",

          ownerName: "",

          ownerEmail: "",

          ownerPhone: "",

          description: "",

          domainStatus: "غير مربوط",

        }}

        initialProducts={[]}

        initialCategories={[]}

        initialOffers={[]}

        initialLoyaltySettings={{

          pointsPerSar: 1,

          welcomePoints: 0,

          enabled: true,

          earnRules: [],

          redemptionRules: [],

        }}

        initialLoyaltyRewards={[]}

        initialCustomIdentity={defaultCustomIdentityTheme()}

        configError="تعذر تحميل بيانات الثيم"

      />

    );

  }

}


```

# File: app/favicon.ico

```ico
         (  F          (  n  00     (-  �         �  �F  (                                                           $   ]   �   �   ]   $                                       �   �   �   �   �   �   �   �                           8   �   �   �   �   �   �   �   �   �   �   8                  �   �   �   �   �   �   �   �   �   �   �   �              �   �   �   �   �   �   �   �   �   �   �   �   �   �       #   �   �   �OOO�������������������������ggg�   �   �   �   #   Y   �   �   ��������������������������555�   �   �   �   Y   �   �   �   �   �kkk���������������������   �   �   �   �   �   �   �   �   �   �			������������������   �   �   �   �   �   Y   �   �   �   �   �JJJ���������kkk�   �   �   �   �   �   Y   #   �   �   �   �   ����������			�   �   �   �   �   �   #       �   �   �   �   �   �111�DDD�   �   �   �   �   �   �              �   �   �   �   �   �   �   �   �   �   �   �                  8   �   �   �   �   �   �   �   �   �   �   8                           �   �   �   �   �   �   �   �                                       $   ]   �   �   ]   $                                                                                                                                                                                                                                                                                    (       @                                                                               ,   U   �   �   �   �   U   ,                                                                                      *   �   �   �   �   �   �   �   �   �   �   �   �   *                                                                      �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                                                          Q   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   Q                                               r   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   r                                       r   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   r                               O   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   O                          �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                      �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �               (   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   '           �   �   �   �   �   �   �888���������������������������������������������������������___�   �   �   �   �   �   �   �          �   �   �   �   �   �   ����������������������������������������������������������SSS�   �   �   �   �   �   �   �      +   �   �   �   �   �   �   �   �hhh�����������������������������������������������������   �   �   �   �   �   �   �   �   +   T   �   �   �   �   �   �   �   ��������������������������������������������������,,,�   �   �   �   �   �   �   �   �   T   �   �   �   �   �   �   �   �   �   �GGG���������������������������������������������   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   ������������������������������������������   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �+++���������������������������������jjj�   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   ����������������������������������   �   �   �   �   �   �   �   �   �   �   �   T   �   �   �   �   �   �   �   �   �   �   ��������������������������III�   �   �   �   �   �   �   �   �   �   �   �   T   +   �   �   �   �   �   �   �   �   �   �   �   �hhh����������������������   �   �   �   �   �   �   �   �   �   �   �   +      �   �   �   �   �   �   �   �   �   �   �   ������������������,,,�   �   �   �   �   �   �   �   �   �   �   �   �          �   �   �   �   �   �   �   �   �   �   �   �   �GGG�������������   �   �   �   �   �   �   �   �   �   �   �   �   �           '   �   �   �   �   �   �   �   �   �   �   �   �   ����������   �   �   �   �   �   �   �   �   �   �   �   �   (               �   �   �   �   �   �   �   �   �   �   �   �   �333�___�   �   �   �   �   �   �   �   �   �   �   �   �   �                      �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                          O   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   O                               r   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   r                                       r   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   r                                               Q   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   Q                                                          �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                                                                      *   �   �   �   �   �   �   �   �   �   �   �   �   *                                                                                      ,   U   �   �   �   �   U   ,                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               (   0   `           -                                                                                             	   (   L   j   �   �   �   �   j   K   (   	                                                                                                                                          V   �   �   �   �   �   �   �   �   �   �   �   �   �   �   U                                                                                                                      %   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   &                                                                                                      �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                                                                                          Q   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   R                                                                              �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                                                                     �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                                                             �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                                                     �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                                              �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                                       P   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   O                                  �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                              �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                       #   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   #                   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                  �   �   �   �   �   �   �   �   �   �$$$�hhh�eee�eee�eee�eee�eee�eee�eee�eee�eee�eee�eee�eee�eee�eee�eee�eee�eee�eee�eee�eee�eee�PPP��   �   �   �   �   �   �   �   �   �              U   �   �   �   �   �   �   �   �   �   ������������������������������������������������������������������������������������������sss�   �   �   �   �   �   �   �   �   �   �   U           �   �   �   �   �   �   �   �   �   �   �   �eee��������������������������������������������������������������������������������������   �   �   �   �   �   �   �   �   �   �   �       	   �   �   �   �   �   �   �   �   �   �   �   ����������������������������������������������������������������������������������HHH�   �   �   �   �   �   �   �   �   �   �   �   �   	   (   �   �   �   �   �   �   �   �   �   �   �   �   �EEE�����������������������������������������������������������������������������   �   �   �   �   �   �   �   �   �   �   �   �   �   (   K   �   �   �   �   �   �   �   �   �   �   �   �   �   �������������������������������������������������������������������������,,,�   �   �   �   �   �   �   �   �   �   �   �   �   �   L   j   �   �   �   �   �   �   �   �   �   �   �   �   �   �)))���������������������������������������������������������������������   �   �   �   �   �   �   �   �   �   �   �   �   �   �   j   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   ������������������������������������������������������������������   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   ����������������������������������������������������������iii�   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �eee������������������������������������������������������   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   ��������������������������������������������������HHH�   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   j   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �EEE���������������������������������������������   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   j   L   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �����������������������������������������,,,�   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   K   (   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �)))�������������������������������������   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   (   	   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   ����������������������������������   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   	       �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   ��������������������������iii�   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �           U   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �eee����������������������   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   U              �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   ������������������HHH�   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                  �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �EEE�������������   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                   #   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   ���������,,,�   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   #                       �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �222�}}}�   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                              �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                                  O   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   P                                       �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                                              �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                                                     �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                                                             �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                                                                     �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                                                                              R   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   Q                                                                                          �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �                                                                                                      &   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   �   %                                                                                                                      U   �   �   �   �   �   �   �   �   �   �   �   �   �   �   V                                                                                                                                          	   (   K   j   �   �   �   �   j   L   (   	                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        �PNG

   IHDR         \r�f   sRGB ���   8eXIfMM *    �i            �       �           D"8s  IDATx�]	�ՙn�]<QVA���h$	�N��13*�q��d�č�I���D�L2��(�(Ԙ2�ę�G	��q_@屈���xț�Џ��{o�������U�{}�O��;������9�d���(Dg��8	��N �]��@�hx�?v �N�3�=`;�6�.�&��u��  ��6�P��н��@�àR� P�iZq�^DN���wp����X�hИHg@��
:��|�5` p"@�'�ɲ�s{�p�*�2����� d ү���|(0�
0 ��>K�
�xX�6 IJ� �C|?$KEN�}ϓ|������h $	2 ��|/� . Nz �#���W�e�
�5������ܶ���;�y �� �g�s�h^  I�� DL(�;�8��Hjg�cH|x�1��R"�a���Ӂ� G��@��9`/`%0�H�@j�~,���K
�,t).��I���D�T�O�)~��V�u$b 誛�U%�7������ _�$b 8A������J�3` 510wQ�?��vr���:�2�K�@ ��v*{%#��A�Z�咁^(��=�g \��W�����!:��,`�6��643�:@�c.Fٟ����u?�<��'������_܏vp: �8Q��
I�Ł�p{3���kHȢ�G�����c�Ѽ<�62&�
��2uC�����敭��T�3�
�����;���d�/~m��.��X�@{�w.��d]G�� {lK��Eb���(P�RuM�T�C�����d��])��_Lm�=��=@b���K��GUk�^�U�������)1����g�T���m`9�\����Q��@����Ⱆ6�:ڞ�^�w�����E�D�� �	�5����F�,��
�X"�d�m�<�nB~��@����t�t�x���;�f�>����I8����8��C1۪$B���e���+��jl��EZ��& ��S:�:�6�m����\G1��`���!�nl�l�Ɗ�^�Q`��@Oc�S��@e�ͷ���qb�p���S��@up���F�D@�Г������2@#����L3 �A��$H2� _h��FH#rq(��O�D�򤬈���runGOWa�b� &�SgD�3�ED�to�*Ǥ����9k��~)���,$� x�R�1�v�K ��9�D䍁U(�w�&LE��ꩻ�S)��3�Y8x8 $.i�(��K�ŀY����a�]����4��ǀ	c����@3�f����4� Ƣ���/*b��� ���$!I�~��7�B*-1`	o � �	�$��ǡD�����L������ �J"���OQ��)��2@#�x4�"$e ���I�8��Oi��8�"� �G��8[x�t<�.��7&�m&؎R�^��tq� ؕ�.���Y�-2� �d� ��*_��&d|j\�W�b ��G����*g�� ��釁�F4�"I�؃�/ b1q�N����Y�D��p���9���p�}w\� �Ԥ���1 j`��O���xK=��H�� �A��1�#�
D:U8j���t���$b b�A||�U�Q��26%��)1 ��_�ꢳ!~D��� ��+b >A��:]�E$��50��GDhR�t����ݻwR�)��P� ��n$� 3���@bS�Nu�,Y�j�ʲ��:����;�����@�`�|�-[)�'OV��Ն�sFxڮ��ۥ�n}͛7�����~��ƺ�:���Q��J_��UKj8�q0x���;v4 ̞=[�hW=�	��	�&�!e5�8hѢE��w�]�����6���_�iW}�SZ�?	�/`�;vl�}��2 <�h�" ����A�܁�X,�m۶�+V�(��<�w���#F�^���;���aH�c ���)S�*�{a���p��c89(�^����4�&E��oÆ��W�/��u�=�^���*?{k^�_E�����z���g�� UI-���{WU*
�:p�9.tڷo(/ݺus>��3�'�^�Rg���ڞG��I_D�������~~� ��{���?N0�7�S��.ƍ׸�~?}/y]nA;�أ���2 ]�FOB2C?�_I����[�:�:�=#�OzK�-� ��ϣ�%����?j��I���P�ۯ��{N�-hU��t�:������� ,���G�K�-hU���c�hP7 ����@�n?�\�-�k�.���2�:�� �`��F��=�-�V�_�G��܂V� ��}�0 WI����F��ʭ���sM�rZ�8pJ�Q�*@OK8���
rZ��ݖa, ��w� �S�W^y����.��5�at7��ݏ���Tv#�~7n��A"�����+��W��pM��/�hK8����g��F/^������M{e ��R�|�)q��7�t��?8'���K��P~���瞰�\��r��>�ǷUk �eP��|�^x����
�/V/��v���������*�p�v�� ����ʟ]J��}��k8(������ĉ�ѣGǗ�O�mڴq,X�o���e.�^ �Qx���p�t����4^_�N�{�����y�2 �s����� �-عsg�s���i�v��Z8
!~PJ?�c�������|�] �ܽ{��z�긓R��1pn���z�����tlp�9�f�r�v�jT殿�z�4*O�L�~����ԕ3��4�~~�r�;�m�xY�+���������3 r�;�m�x�4���:7]ՁqL�4)U��!r�1��u�6���$��7����8�w��̙3Ǹ|5�>?�\z��O���͆� ��,�E����3�����2���[����2Wu:E�����^p.H1cJ�t�]}��B�u��SOu�����Ic�O�����%�  �AZ������k����D?�5 �@Q�����3�w�+��"��T��S��Uޥ�13��?��5 M'݋��>p��Z�j�~fj�׈�סԐ�n�����>� ��i5D�[bf ��~a�'�`Xc��� -�1�k����āI�������k��Q�ů|�k�M��(92�@�t�����݂X-�Lדa��N4��qܞ'$f0@�@V�nA�ܘY�L9:�|/^s� ��	��)0`�j��T\w�uZ-����¨\�	@�:��c�t���{�-��Rb��1%� �I,Y%T���~��r�1����C��,�$��*ˀ���f<��0z����h�F���� ����|���8Z-�CR����Tg� �HRf��glY����s��-��p��'+����m�_ؒg������C�{ �	����Ȫ�ϏΙ3g�-�GR|׹7`G��񥡘�0�U��_ٵZЏ�د�D�)���\>����ʗ������z N���@��~~��-��P��{rs���@�<����|.]�Ը|��m|g����_��y�W�KD1�b�M���%�s\����r�1��n�\�ƒ�"-� �`.4��~%3��I}[0A��$��= -�>BH"G�ۏ�^r��<�EBG�i �%���9�@^�~~@�����1����@� t�-[����{%@C�$�mAg���Κ5kʆх����/双O��l��ӿ��B�@.X���u�p�O��6��x�9MPn�`߷o_���^n�`t�
��(�����\r��s�A�y���ۂ�T��@h
�E0l�0��;�tڵӘkƸN����Y�jU��
S#�|^㽺- |��p�N�.���ޥ`�^{�zL�6��4 �ě�b��e�]&"�d�sΜ9Uޥ�U0�!��*nP�*`���o֨v����i8G�����hh��m������ɓ�s�=�{J�U0�Ղ���wZ������������8bEz���,Y�D��![C�>}��7:k׮�no��f� >jvR?#b��X�(��F�AT�F��i��[�{��zv��>��C���a+�[0B2�D��=��G~�(
�ĺ������LO�\s�܂>"8|�`[)
&Lp8�'��������4 oGe�#�ۏ�lْ_\�D̀܂�2Z�l��i�9��t�ȑ9f ޢ�-����=���Y�y��n?uQ�}Xͬ�sA�i >=��1�=R��+� +�܂��.2 ��K������CƢۃ20h� �˫%53�5@�MA�%���̣������j[��9�;�� _(�����0��~r���\�{�m�P����x#TT9��n?����N#��ץ&�}� ��)
�T�VL�!���j���`�p �8@Rr�UAV�A����=��-����pLH�`@n�*Ȋ1�܂U���?}w ]�H2@�ߴi��V���[�˯%�������5 �8�)Э
T`��|rZbZ-�.�!da+@� ���ߞ�Z�gf�[0p���� �� I��gr�$��o%P�_rCy�V�|߽����"m�Y���-�[ l��k xA� ��ۯ9]�[pҤI�Ȩ�pP���k ��Feِ���gHE�d�nAm"Z�$��5}���z�8����2r�X�|� ��Sܻw��r�J�s�J�~�T�f�z{ �ͫ ��x�j?j��Q�E�n� �js���|G�xз�<dXt(��Q�E�.�p�47 ��)���;��ys�_�V�D���-XTi����?� �~�薜����� �`Q�=V�?���^�
������.]�|X�
�m�B~��?���J� �D�������~�h r�����ER���A݀�B���~w�q�Ӿ}���<�ŕ[й5�d��-�`�5 ?�Kq�~l4��0@��)����/I��(����؋���n��9���Y�4�!�Cو2ח*w9���GKݐ�s�&�r�e��s��?�6�8J� |(�uwO䴁d�&K)�nA��?R���n@7,��8�=���r�e����n�M�69k��M7�����J��R�]�e�n��9���Z���� /?នo>��󕾤�rzr�� ��`���V{���u��4448�V��ra��p� ��QRZ�<{�dK.F9��#~T���s.����N%*� ���Ýu�8G&����/W:*x%�{�}@� ��l���Nc#�AI�������i����*?�د�0}�g���C"Āpۯ������4薒ҏ(b�8�_Q�Y� ���r7'���`��� �j �6�� *��3�W�g��"��l��1�:�Sg}%� �	��P?����1`�����Y� ��"��D�0b@�� �����9������[t��F1���p`k�\U�`��R��A#W81 e`)R�ZM��� ��[u��F0�	rq.����� #^�=C"Ā9P'�R~f�� �
pn�zdC"�e���?�\K����@&$b }jz�3۵� x/{��1 Ra�#�|��ƟUK�= &�^��TM�n�2�9�5)?s���{O'�D��D���o [kM�oK0�x�� �Td�_@]b r� �G�����; ����D��D���1�gaR�`��'`0�  �>\��/���f��������ŀ����!fn�Z�|b����U�.t���ट���r�9�+��������	�b rnE�Dk�= ��8�����!b R�Cl�P�E�`�܌�K�'~�@���}*�!`�@��6 L��;��	$b@D��?#��g�F�
��V��1�v��;�Es��Q����=ɮ�4���b@T��n��!��3q�0^�V�� c ��1�ܶ��[����M�=8I����1@�څ@Cu��`N�o�� WJĀ� W����e��I�� n��N�mீ��ܴ�_d��(�4`E܅I� ���"̵�1 *3�+\�E� �\M���)g	r���
���8�>��p�?vI� �0�ǀ~�!b������$'�%"I����R��i�1 �0��? S~&�� �r�����{ n�_�����L�?��T�e��Ǝ�7�C"r��OQ~"qI� ��O 8�?$b �܋r�#@�_�v�J̙��/��3�'d�/����W[����o'N��l��-2� ���@j�O~��0���2` H�@�؄��+����pOB� �uO��(l�S�ԕ���9����~�c�:x/�Xd�.���Ɣ�d ��V�y@F $H2� ����+M*�i��l8O@F $H2� ���2�4& r�PO��֢����7N�YS ����Y�1`��;�JS3n� g[�'��@W@"la`32�n?'�HB2p
�hām�mu �����j@F@��V����Z!��xI���H�y�ѱ)��>��Z!6 ���a�`�����dDV$9f���	pM�6�I�!LG:\LdrwPy�~�P�%��L3��7�TK��Am�mo|�6��	3��-�h J3��?�67 �yr���"����g��4. $�1���_�[*��&���S/�dq�������C��h �3��>�6Ŷ%������\�#�RZq��=lK|ŔX��X�WS�e j5 /����$���:��v@������8���d��1(�z2~F�)���3��͋���l��C�������#����=�.\Lt? %� N$9b�%�:���2��u	 �1|-�	ld�����t $b��@?���@� �F�c��ρ^�D�d�[9�ࠐz�����:
H�@ ��P2v )~���@����z5��|����R�ֵ���|`#�W39؂��<�"-�0��\<�d��u�oGLz 1��Gp����e�倯d� .�jH�@j�F�3��@ c{s<��J&	�@�����b���w��  �� ��n���v��< �����,M;��*p>p!0hH��{=�����x�]I�� DLh����<'��h8�@V �#��J���f� I�� �Hn����W�}�N�t[u�$�������� �@� 2 	�]&)�� #�3���,	=%�T���k�&�  I�����I��ӳ� �[8	�	�L�]�]t�T�g���6�-@b2 U�OV��: A?��} .i�|	�xC���rv�w; ��#�>�i 8_b82 �WP����� �� {'n���8�z;�Ƥy��s� ��@���P��o|�S�ih $3��@߹j��    IEND�B`�
```

# File: app/globals.css

```css
@import "tailwindcss";

:root {
  /* Official palette */
  --branda-espresso-dark: #311912;
  --branda-coffee-brown: #4a281d;
  --branda-brand-brown: #6b3a25;
  --branda-gold-accent: #d9a33f;
  --branda-soft-gold: #f0c568;
  --branda-cream-base: #fcf8f3;
  --branda-warm-sand: #f2e7d9;
  --branda-border-sand: #e7d7c6;
  --branda-muted-text: #806a5e;

  /* Backward-compat aliases */
  --branda-brown: var(--branda-coffee-brown);
  --branda-brown-dark: var(--branda-espresso-dark);
  --branda-brown-luxury: var(--branda-brand-brown);
  --branda-cream: var(--branda-cream-base);
  --branda-cream-secondary: var(--branda-warm-sand);
  --branda-gold: var(--branda-gold-accent);
  --branda-muted: var(--branda-muted-text);
  --branda-border: var(--branda-border-sand);
  --branda-cream-text: var(--branda-soft-gold);
  --background: var(--branda-cream-base);
  --foreground: var(--branda-espresso-dark);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

html,
body {
  overflow-x: hidden;
  max-width: 100%;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-geist-sans), system-ui, sans-serif;
}

.sidebar-scroll {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.sidebar-scroll::-webkit-scrollbar {
  display: none;
}

.branda-glow-gold {
  box-shadow: 0 0 32px rgba(217, 163, 63, 0.15);
}

.branda-neumo {
  box-shadow:
    8px 8px 24px rgba(49, 25, 18, 0.06),
    -6px -6px 20px rgba(255, 255, 255, 0.9);
}

.branda-neumo-inset {
  box-shadow:
    inset 3px 3px 8px rgba(49, 25, 18, 0.06),
    inset -2px -2px 6px rgba(255, 255, 255, 0.95);
}

@keyframes branda-fade {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-branda-fade {
  animation: branda-fade 0.45s ease-out forwards;
}

@keyframes branda-slide {
  from {
    opacity: 0;
    transform: translateX(12px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.animate-branda-slide {
  animation: branda-slide 0.5s ease-out forwards;
}

/* Admin / dark panels — readable fields */
.branda-admin-fields input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),
.branda-admin-fields select,
.branda-admin-fields textarea {
  background-color: #211711 !important;
  color: #f8e8d2 !important;
  border-color: rgba(246, 195, 91, 0.25) !important;
}

.branda-admin-fields input::placeholder,
.branda-admin-fields textarea::placeholder {
  color: rgba(203, 178, 156, 0.75) !important;
}

.branda-admin-fields select option {
  background-color: #211711;
  color: #f8e8d2;
}

/* Custom identity — readable fields via contrast tokens inherited from <main> */
.brand-identity-custom-theme .brand-cafe-fields input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),
.brand-identity-custom-theme .brand-cafe-fields select,
.brand-identity-custom-theme .brand-cafe-fields textarea {
  background-color: var(--ci-input-bg, #ffffff);
  color: var(--ci-input-fg, #241610);
  border-color: var(--ci-input-border, #e5d8cd);
}

.brand-identity-custom-theme .brand-cafe-fields input::placeholder,
.brand-identity-custom-theme .brand-cafe-fields textarea::placeholder {
  color: var(--ci-input-placeholder, #9b8173);
}

.brand-identity-custom-theme .brand-cafe-fields select option,
.brand-identity-custom-theme .brand-cafe-form-select option {
  background-color: var(--ci-dropdown-bg, #ffffff);
  color: var(--ci-dropdown-fg, #241610);
}

/* Dashboard theme builder — isolate light surfaces from gold BentoCard text */
.theme-builder-form-fields {
  color: #3a2117;
}

.theme-builder-form-fields select,
.theme-builder-form-fields input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="color"]),
.theme-builder-form-fields textarea {
  background-color: #ffffff !important;
  color: #241610 !important;
  border-color: #e5d8cd !important;
}

.theme-builder-form-fields select option {
  background-color: #ffffff;
  color: #241610;
}

.theme-builder-form-fields input::placeholder,
.theme-builder-form-fields textarea::placeholder {
  color: #9b8173 !important;
}

```

# File: app/layout.tsx

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

```

# File: app/login/page.tsx

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail } from "lucide-react";
import { BrandaLogo } from "@/components/ui/branda-logo";
import { NeumoInput, PrimaryButton, SoftCard } from "@/components/ui/design-system";
import { loginWithRole } from "@/lib/platform/auth";
import { LOGO } from "@/lib/ui/brand";
import { BRAND_COLORS as C } from "@/lib/ui/brand-colors";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("owner@qatrah.com");
  const [password, setPassword] = useState("123456");
  const [loading, setLoading] = useState(false);

  function handleLogin() {
    setLoading(true);
    void loginWithRole(email, password).then((result) => {
      if (!result.ok || !result.redirectTo) {
        setLoading(false);
        alert(result.message);
        return;
      }
      router.push(result.redirectTo);
    });
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen"
      style={{ background: C.creamBase, color: C.espressoDark }}
    >
      <section className="mx-auto grid min-h-screen max-w-6xl min-w-0 items-center gap-8 px-4 py-8 sm:gap-10 sm:px-6 sm:py-10 lg:grid-cols-2">
        <div
          className="relative hidden overflow-hidden rounded-[32px] border p-8 shadow-2xl sm:rounded-[40px] sm:p-10 lg:block"
          style={{
            borderColor: C.borderSand,
            background: `linear-gradient(to bottom right, ${C.coffeeBrown}, ${C.espressoDark})`,
            color: C.creamBase,
          }}
        >
          <Image
            src={LOGO.brownBg}
            alt=""
            width={200}
            height={200}
            className="pointer-events-none absolute -left-8 -top-8 opacity-25 object-contain"
          />
          <BrandaLogo variant="dark" width={200} height={80} priority className="relative" />
          <h1 className="relative mt-8 text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">
            دخول لوحة التحكم
          </h1>
          <p
            className="relative mt-5 max-w-md text-lg font-bold leading-9"
            style={{ color: C.warmSand }}
          >
            سجّل دخولك لإدارة حسابك في برندة. يتم توجيهك تلقائيًا حسب نوع الحساب (كوفي /
            أدمن).
          </p>
          <Link
            href="/"
            className="relative mt-8 inline-block font-black underline"
            style={{ color: C.softGold }}
          >
            العودة للصفحة الرئيسية
          </Link>
        </div>

        <SoftCard className="w-full min-w-0 p-5 sm:p-8">
          <BrandaLogo variant="brown" width={160} height={64} className="mb-6" />
          <h2 className="text-2xl font-black sm:text-3xl" style={{ color: C.coffeeBrown }}>
            تسجيل الدخول
          </h2>
          <p className="mt-2 text-sm font-bold" style={{ color: C.mutedText }}>
            أدخل بيانات حسابك للمتابعة.
          </p>

          <label className="mt-6 block">
            <span className="text-xs font-black" style={{ color: C.mutedText }}>
              البريد الإلكتروني
            </span>
            <div className="relative mt-2">
              <Mail
                className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2"
                style={{ color: C.brandBrown }}
              />
              <NeumoInput
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                className="pr-12"
              />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="text-xs font-black" style={{ color: C.mutedText }}>
              كلمة المرور
            </span>
            <div className="relative mt-2">
              <Lock
                className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2"
                style={{ color: C.brandBrown }}
              />
              <NeumoInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="••••••••"
                className="pr-12"
              />
            </div>
          </label>

          <PrimaryButton
            onClick={handleLogin}
            disabled={loading}
            className="mt-6 h-14 w-full"
          >
            {loading ? "جاري الدخول..." : "دخول"}
          </PrimaryButton>

          <div
            className="mt-5 rounded-2xl p-4 text-sm font-bold leading-7"
            style={{ background: C.warmSand, color: C.mutedText }}
          >
            للتجربة:
            <br />
            كوفي: owner@qatrah.com / 123456
            <br />
            أدمن: admin@branda.com / admin123
          </div>
        </SoftCard>
      </section>
    </main>
  );
}

```

# File: app/page.tsx

```tsx
import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  Gift,
  LayoutGrid,
  Megaphone,
  Play,
  ShoppingBag,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { BrandaLogo } from "@/components/ui/branda-logo";
import { BRAND_COLORS as C } from "@/lib/ui/brand-colors";

const NAV_LINKS = [
  { href: "#features", label: "المزايا" },
  { href: "#solutions", label: "الحلول" },
  { href: "#pricing", label: "الباقات" },
  { href: "/login", label: "تسجيل الدخول" },
] as const;

const FEATURES = [
  {
    icon: LayoutGrid,
    title: "منيو رقمي",
    desc: "منيو تفاعلي يحدّثه فريقك في ثوانٍ ويعرضه العملاء على الجوال.",
  },
  {
    icon: CalendarDays,
    title: "حجوزات سهلة",
    desc: "نظّم الطاولات والأوقات وعدد الضيوف بدون مكالمات متكررة.",
  },
  {
    icon: Gift,
    title: "عروض وخصومات",
    desc: "أطلق عروض موسمية وكوبونات تلقائية تزيد المبيعات.",
  },
  {
    icon: BarChart3,
    title: "تقارير ذكية",
    desc: "تابع المبيعات، أوقات الذروة، وأداء الفروع من لوحة واحدة.",
  },
  {
    icon: Users,
    title: "عملاء",
    desc: "سجّل تفضيلات الزوار وتاريخ زياراتهم لخدمة أذكى.",
  },
  {
    icon: Sparkles,
    title: "نقاط ولاء",
    desc: "كافئ العملاء بنقاط تزيد تكرار الزيارة والولاء.",
  },
  {
    icon: Megaphone,
    title: "تسويق ذكي",
    desc: "حملات SMS وإشعارات تصل للعميل المناسب في الوقت المناسب.",
  },
  {
    icon: ShoppingBag,
    title: "إدارة الطلبات",
    desc: "تابع الطلبات الداخلية والتيك أواي من شاشة موحدة.",
  },
] as const;

const TRUST_PLACEHOLDERS = [
  "BREW LAB",
  "مقهى نُور",
  "MOKA",
  "SIP HOUSE",
  "دلة",
  "ROAST & CO",
] as const;

const COFFEE_HERO =
  "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=900&h=700&fit=crop&q=80";

function CircularProgress({ value, max }: { value: number; max: number }) {
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value / max, 1);
  const offset = circumference * (1 - progress);

  return (
    <div className="relative mx-auto flex h-[220px] w-[220px] items-center justify-center sm:h-[260px] sm:w-[260px]">
      <div
        className="absolute inset-0 rounded-full blur-2xl"
        style={{ background: `${C.goldAccent}22` }}
        aria-hidden
      />
      <svg
        viewBox="0 0 200 200"
        className="relative h-full w-full -rotate-90"
        aria-hidden
      >
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke={`${C.goldAccent}33`}
          strokeWidth="12"
        />
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke={C.goldAccent}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="drop-shadow-[0_0_18px_rgba(217,163,63,0.45)]"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <Star className="mb-2 h-7 w-7" style={{ color: C.softGold }} fill={C.softGold} />
        <p className="text-5xl font-black leading-none" style={{ color: C.softGold }}>
          540
        </p>
        <p className="mt-2 text-sm font-bold" style={{ color: `${C.creamBase}cc` }}>
          نقطة مكتسبة
        </p>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main
      dir="rtl"
      className="min-h-screen overflow-x-hidden"
      style={{ background: C.creamBase, color: C.espressoDark }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b backdrop-blur-md"
        style={{
          borderColor: C.borderSand,
          background: `${C.creamBase}e6`,
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="shrink-0">
            <BrandaLogo variant="brown" width={140} height={56} priority />
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {NAV_LINKS.map((link) =>
              link.href.startsWith("/") ? (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm font-bold transition-opacity hover:opacity-70"
                  style={{ color: C.brandBrown }}
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm font-bold transition-opacity hover:opacity-70"
                  style={{ color: C.brandBrown }}
                >
                  {link.label}
                </a>
              ),
            )}
          </nav>

          <Link
            href="/register"
            className="shrink-0 rounded-2xl px-4 py-2.5 text-sm font-black shadow-md transition hover:brightness-110 sm:px-5"
            style={{ background: C.coffeeBrown, color: C.creamBase }}
          >
            ابدأ الآن مجانًا
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <span
            className="inline-block rounded-full px-4 py-1.5 text-sm font-bold"
            style={{ background: C.warmSand, color: C.brandBrown }}
          >
            منصة إدارة الكافيهات
          </span>

          <h1 className="mt-6 text-4xl font-black leading-tight sm:text-5xl lg:text-[3.25rem]">
            منيو، حجوزات، ولاء، وتسويق في مكان{" "}
            <span className="relative inline-block" style={{ color: C.goldAccent }}>
              واحد
              <svg
                className="absolute -bottom-1 left-0 w-full"
                viewBox="0 0 120 12"
                fill="none"
                aria-hidden
              >
                <path
                  d="M4 8C28 2 52 10 76 6C92 3 104 4 116 5"
                  stroke={C.goldAccent}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>

          <p
            className="mx-auto mt-5 max-w-2xl text-base font-bold leading-8 sm:text-lg"
            style={{ color: C.mutedText }}
          >
            برندة تساعد الكوفيهات على إدارة المنيو، الحجوزات، العروض، العملاء، نقاط
            الولاء، والتقارير من لوحة تحكم واحدة.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex h-14 min-w-[200px] items-center justify-center rounded-2xl px-8 text-base font-black shadow-lg transition hover:brightness-110"
              style={{ background: C.coffeeBrown, color: C.creamBase }}
            >
              ابدأ الآن مجانًا
            </Link>
            <button
              type="button"
              className="inline-flex h-14 min-w-[200px] items-center justify-center gap-2 rounded-2xl border px-8 text-base font-black transition hover:bg-white/60"
              style={{ borderColor: C.borderSand, color: C.espressoDark }}
            >
              <Play className="h-4 w-4 fill-current" />
              شاهد كيف يعمل
            </button>
          </div>
        </div>

        <div
          className="mx-auto mt-12 max-w-5xl overflow-hidden rounded-[2rem] border p-4 sm:p-6"
          style={{ background: C.warmSand, borderColor: C.borderSand }}
        >
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
            <div className="overflow-hidden rounded-[1.5rem]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={COFFEE_HERO}
                alt="فنجان قهوة latte على طاولة خشبية"
                className="h-full min-h-[220px] w-full object-cover sm:min-h-[280px]"
              />
            </div>

            <div
              className="flex flex-col justify-center rounded-[1.5rem] border bg-white/70 p-6 sm:p-8"
              style={{ borderColor: C.borderSand }}
            >
              <p className="text-sm font-bold" style={{ color: C.mutedText }}>
                إحصاء
              </p>
              <p
                className="mt-1 text-5xl font-black leading-none sm:text-6xl"
                style={{ color: C.goldAccent }}
              >
                540
              </p>
              <p className="mt-2 text-lg font-black">نقاط ولاء تم جمعها</p>

              <div className="mt-6 flex items-center gap-3">
                <div className="flex -space-x-2 space-x-reverse">
                  {[C.brandBrown, C.coffeeBrown, C.goldAccent, C.mutedText].map(
                    (color, i) => (
                      <div
                        key={i}
                        className="flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-black text-white"
                        style={{ background: color, borderColor: C.creamBase }}
                      >
                        {i + 1}
                      </div>
                    ),
                  )}
                </div>
                <span
                  className="rounded-full px-3 py-1 text-sm font-black"
                  style={{ background: `${C.goldAccent}22`, color: C.brandBrown }}
                >
                  +12k
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features bento */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 className="text-center text-3xl font-black sm:text-4xl">
          كل ما تحتاجه لإدارة كوفي شوبك
        </h2>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            const isWide = index === 0 || index === 7;

            return (
              <article
                key={feature.title}
                className={`rounded-3xl border p-6 transition hover:-translate-y-0.5 hover:shadow-md ${
                  isWide ? "lg:col-span-2" : ""
                }`}
                style={{
                  background: "white",
                  borderColor: C.borderSand,
                  boxShadow: "6px 8px 24px rgba(49, 25, 18, 0.05)",
                }}
              >
                <div
                  className="mb-4 inline-flex rounded-2xl p-3"
                  style={{ background: C.warmSand }}
                >
                  <Icon className="h-6 w-6" style={{ color: C.brandBrown }} />
                </div>
                <h3 className="text-lg font-black">{feature.title}</h3>
                <p
                  className="mt-2 text-sm font-bold leading-7"
                  style={{ color: C.mutedText }}
                >
                  {feature.desc}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      {/* Dark loyalty */}
      <section
        id="solutions"
        className="mx-4 overflow-hidden rounded-[2rem] sm:mx-6 lg:mx-auto lg:max-w-6xl"
        style={{ background: C.espressoDark }}
      >
        <div className="grid items-center gap-10 px-6 py-14 sm:px-10 sm:py-16 lg:grid-cols-2 lg:gap-12">
          <div>
            <p className="text-sm font-bold" style={{ color: `${C.softGold}aa` }}>
              إحصاء
            </p>
            <h2 className="mt-2 text-3xl font-black leading-tight sm:text-4xl" style={{ color: C.creamBase }}>
              نقاط ولاء تزيد العودة
            </h2>
            <p className="mt-4 max-w-md text-base font-bold leading-8" style={{ color: `${C.creamBase}bb` }}>
              كل نقطة تقرب عميلك أكثر — برنامج ولاء مرن يكافئ الزيارات المتكررة
              ويحوّل الزائر إلى عميل دائم.
            </p>
            <Link
              href="/register"
              className="mt-8 inline-flex h-12 items-center justify-center rounded-2xl px-6 text-sm font-black transition hover:brightness-110"
              style={{ background: C.goldAccent, color: C.espressoDark }}
            >
              تعرف على برنامج الولاء
            </Link>
          </div>

          <CircularProgress value={540} max={700} />
        </div>
      </section>

      {/* Trust */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 className="text-center text-2xl font-black sm:text-3xl">
          موثوق من كوفيهات حول المملكة
        </h2>
        <p
          className="mx-auto mt-3 max-w-xl text-center text-sm font-bold"
          style={{ color: C.mutedText }}
        >
          أسماء تجريبية للعرض — لا تمثل عملاء فعليين
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4 sm:gap-6">
          {TRUST_PLACEHOLDERS.map((name) => (
            <div
              key={name}
              className="rounded-2xl border px-5 py-3 text-sm font-black tracking-wide opacity-70 grayscale"
              style={{
                borderColor: C.borderSand,
                background: C.warmSand,
                color: C.brandBrown,
              }}
            >
              {name}
            </div>
          ))}
        </div>
      </section>

      {/* Pricing anchor placeholder */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
        <p className="text-center text-sm font-bold" style={{ color: C.mutedText }}>
          باقات مرنة تناسب الكوفيهات الصغيرة والسلاسل الكبيرة — تواصل معنا للتفاصيل.
        </p>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div
          className="grid items-center gap-8 overflow-hidden rounded-[2rem] border p-6 sm:p-10 lg:grid-cols-2"
          style={{ background: C.warmSand, borderColor: C.borderSand }}
        >
          <div className="flex justify-center lg:justify-start">
            <div
              className="relative flex h-56 w-44 flex-col items-center justify-end rounded-b-[2rem] rounded-t-[1rem] border shadow-lg sm:h-64 sm:w-52"
              style={{
                background: `linear-gradient(180deg, ${C.creamBase} 0%, ${C.warmSand} 100%)`,
                borderColor: C.borderSand,
              }}
            >
              <div
                className="absolute -top-3 h-6 w-24 rounded-sm"
                style={{ background: C.borderSand }}
              />
              <div className="mb-8 px-4 text-center">
                <BrandaLogo variant="brown" width={100} height={40} />
                <p className="mt-2 text-xs font-bold" style={{ color: C.mutedText }}>
                  كوب برنده
                </p>
              </div>
            </div>
          </div>

          <div className="text-center lg:text-right">
            <h2 className="text-3xl font-black sm:text-4xl">جاهز تطور كوفي شوبك؟</h2>
            <p className="mt-4 text-base font-bold leading-8" style={{ color: C.mutedText }}>
              انضم الآن وابدأ رحلتك مع برندة — من المنيو إلى الولاء في منصة واحدة.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
              <Link
                href="/register"
                className="inline-flex h-14 min-w-[180px] items-center justify-center rounded-2xl px-8 text-base font-black shadow-lg transition hover:brightness-110"
                style={{ background: C.coffeeBrown, color: C.creamBase }}
              >
                ابدأ الآن مجانًا
              </Link>
              <Link
                href="/login"
                className="inline-flex h-14 min-w-[180px] items-center justify-center rounded-2xl border px-8 text-base font-black transition hover:bg-white/50"
                style={{ borderColor: C.borderSand, color: C.espressoDark }}
              >
                تواصل معنا
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="border-t py-8 text-center text-sm font-bold"
        style={{ borderColor: C.borderSand, color: C.mutedText }}
      >
        <p>© 2024 برندة. جميع الحقوق محفوظة.</p>
      </footer>
    </main>
  );
}

```

# File: app/register/page.tsx

```tsx
import Link from "next/link";
import Image from "next/image";
import { BrandaLogo } from "@/components/ui/branda-logo";
import { LOGO } from "@/lib/ui/brand";
import { BRAND_COLORS as C } from "@/lib/ui/brand-colors";

export default function RegisterPage() {
  return (
    <main
      dir="rtl"
      className="min-h-screen grid lg:grid-cols-2"
      style={{ background: C.creamBase, color: C.espressoDark }}
    >
      <section
        className="relative hidden flex-col items-center justify-center overflow-hidden px-12 lg:flex"
        style={{
          background: `linear-gradient(to bottom right, ${C.warmSand}, ${C.creamBase})`,
        }}
      >
        <Image
          src={LOGO.brownBg}
          alt=""
          width={280}
          height={280}
          className="pointer-events-none absolute opacity-15 object-contain"
        />
        <BrandaLogo variant="brown" width={220} height={88} priority className="relative" />
        <h1
          className="relative mt-10 text-center text-4xl font-black leading-tight"
          style={{ color: C.coffeeBrown }}
        >
          ابدأ كوفيك الرقمي مع برندة
        </h1>
        <p className="relative mt-4 text-center text-lg font-bold" style={{ color: C.mutedText }}>
          منيو، حجوزات، عروض، ونقاط ولاء في لوحة واحدة.
        </p>
      </section>

      <section className="flex min-w-0 items-center justify-center bg-white px-4 py-8 sm:px-6 sm:py-10">
        <div className="w-full min-w-0 max-w-[620px]">
          <div className="mb-10 flex flex-col items-center text-center">
            <BrandaLogo variant="brown" width={180} height={72} />
            <h1 className="mt-6 text-3xl font-black sm:text-4xl" style={{ color: C.coffeeBrown }}>
              إنشاء حساب
            </h1>
            <p className="mt-2 font-bold" style={{ color: C.mutedText }}>
              أنشئ حساب الكوفي وابدأ التحكم
            </p>
          </div>

          <div
            className="mb-8 grid grid-cols-2 overflow-hidden rounded-2xl border shadow-[4px_6px_16px_rgba(49,25,18,0.06)]"
            style={{ borderColor: C.borderSand }}
          >
            <Link
              href="/login"
              className="bg-white py-4 text-center font-black transition hover:opacity-90"
              style={{ color: C.mutedText }}
            >
              تسجيل الدخول
            </Link>
            <span
              className="py-4 text-center font-black"
              style={{ background: C.coffeeBrown, color: C.creamBase }}
            >
              إنشاء حساب
            </span>
          </div>

          <form className="space-y-4">
            {[
              "اسم صاحب الكوفي",
              "اسم الكوفي",
              "البريد الإلكتروني",
              "رقم الجوال",
              "كلمة المرور",
            ].map((placeholder, i) => (
              <input
                key={placeholder}
                type={i === 2 ? "email" : i === 4 ? "password" : "text"}
                placeholder={placeholder}
                className="branda-neumo-inset h-14 w-full rounded-2xl border px-5 text-right font-bold outline-none focus:border-[#6B3A25]/40"
                style={{
                  borderColor: C.borderSand,
                  background: C.creamBase,
                }}
              />
            ))}

            <Link
              href="/dashboard"
              className="flex h-16 w-full items-center justify-center rounded-2xl text-lg font-black shadow-[6px_8px_24px_rgba(49,25,18,0.25)]"
              style={{ background: C.coffeeBrown, color: C.creamBase }}
            >
              تسجيل
            </Link>
          </form>
        </div>
      </section>
    </main>
  );
}

```

# File: proxy.ts

```typescript
import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";



export async function proxy(request: NextRequest) {

  return updateSession(request);

}



export const config = {

  matcher: [

    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",

  ],

};


```

