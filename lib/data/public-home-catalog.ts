import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBrandNavigationFeatures, getPlanIncludedFeatures } from "@/lib/platform/feature-access";
import { calculateSubscriptionPricing, getPlanDurationOptions, isPurchasablePlan } from "@/lib/platform/subscription-durations";
import { getCafeFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import type { PlatformFeatureCode } from "@/lib/platform/feature-registry";
import type { PublicHomeCatalog, PublicHomeMenu, PublicHomePartner, PublicHomePlan } from "@/lib/platform/public-home-catalog";

type Row = Record<string, unknown>;
type Admin = ReturnType<typeof createAdminClient>;
const PAGE_SIZE = 500;
const PLAN_COLUMNS = "id,name,description,price_sar,annual_discount_percent,duration_unit,duration_count,trial_days,free_after_trial,max_products_monthly,max_orders_monthly,max_branches,features";

function number(value: unknown, fallback = 0) {
  const result = value == null ? fallback : Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error("Invalid public plan value");
  return result;
}

function nullableNumber(value: unknown) {
  return value == null ? null : number(value);
}

function mapPlan(row: Row): PublicHomePlan {
  if (row.price_sar == null || row.price_sar === "") throw new Error("Missing public plan price");
  const priceMonthly = number(row.price_sar);
  const annualDiscountPercent = Math.min(100, number(row.annual_discount_percent));
  const trialDays = nullableNumber(row.trial_days);
  const freeTrial = priceMonthly === 0 && (trialDays ?? 0) > 0;
  const durationUnit = priceMonthly > 0 ? "month" : freeTrial ? "day" : String(row.duration_unit ?? "month");
  if (!["day", "month", "year"].includes(durationUnit)) throw new Error("Invalid public plan duration");
  const durationCount = priceMonthly > 0 ? 1 : freeTrial ? trialDays! : number(row.duration_count, 1);
  if (!Number.isInteger(durationCount) || durationCount < 1) throw new Error("Invalid public plan duration");
  const id = String(row.id);
  const features = Array.isArray(row.features) ? row.features.map(String) as PlatformFeatureCode[] : [];
  const included = new Set(getPlanIncludedFeatures(id, [{ id, features }]));
  return {
    id,
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    priceMonthly,
    annualDiscountPercent,
    durationUnit: durationUnit as PublicHomePlan["durationUnit"],
    durationCount,
    trialDays,
    freeAfterTrial: Boolean(row.free_after_trial),
    maxProductsMonthly: nullableNumber(row.max_products_monthly),
    maxOrdersMonthly: nullableNumber(row.max_orders_monthly),
    maxBranches: nullableNumber(row.max_branches),
    features: getBrandNavigationFeatures()
      .filter(feature => included.has(feature.id) && feature.status === "active")
      .map(feature => ({ id: feature.id, label: feature.titleAr })),
    durations: priceMonthly > 0 ? getPlanDurationOptions().map(option => ({
      months: option.months,
      label: option.label,
      ...calculateSubscriptionPricing({ priceMonthly, annualDiscountPercent }, option.months),
    })) : [],
  };
}

async function readPlans(admin: Admin): Promise<PublicHomePlan[]> {
  const plans: PublicHomePlan[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin.from("platform_plans")
      .select(PLAN_COLUMNS).eq("active", true)
      .order("sort_order").order("id").range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    // Match the brand subscription chooser, including newly added purchasable plans.
    // Trials and administrative/manual grants are not public subscription offers.
    plans.push(...(data ?? []).map(row => mapPlan(row as Row))
      .filter(isPurchasablePlan));
    if (!data || data.length < PAGE_SIZE) return plans;
  }
}

function brandSettings(row: Row): Row | null {
  const settings = Array.isArray(row.cafe_settings) ? row.cafe_settings[0] : row.cafe_settings;
  return settings && typeof settings === "object" ? settings as Row : null;
}

function publicLogoUrl(row: Row): string | null {
  const value = brandSettings(row)?.logo_url;
  if (typeof value !== "string" || /[\\\u0000-\u0020]/.test(value)) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function logoPath(row: Row): string | null {
  const path = brandSettings(row)?.logo_storage_path;
  if (typeof path !== "string") return null;
  // Only the selected brand's current logo in the fixed logo bucket may be signed.
  const parts = path.split("/");
  return parts.length >= 2 && parts[0] === row.id
    && !parts.some(part => !part || part === "." || part === "..") && !/[\\%?#\u0000-\u001f]/.test(path)
    ? path : null;
}

async function readPartners(admin: Admin): Promise<{ partners: PublicHomePartner[]; menuCandidates: PublicHomeMenu[] }> {
  const partners: PublicHomePartner[] = [];
  const menuCandidates: PublicHomeMenu[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    // The homepage intentionally lists every existing brand, independent of menu publication.
    // Do not return slugs, unpublished menu links, owner details or other tenant data.
    const { data, error } = await admin.from("cafes")
      .select("id,name,slug,status,is_public,cafe_settings(logo_storage_path,logo_url)").is("deleted_at", null)
      .order("created_at", { ascending: false }).order("id").range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    const paths = rows.map(logoPath);
    const validPaths = [...new Set(paths.filter((path): path is string => Boolean(path)))];
    const signed = new Map<string, string>();
    if (validPaths.length) {
      // An unavailable logo must not hide the partner's name.
      try {
        const { data: urls } = await admin.storage.from("cafe-logos").createSignedUrls(validPaths, 10 * 60);
        for (const item of urls ?? []) {
          if (item.path && item.signedUrl && !item.error) signed.set(item.path, item.signedUrl);
        }
      } catch { /* Names remain available during a storage outage. */ }
    }
    const pagePartners = rows.map((row, index) => ({
      id: String(row.id), name: String(row.name ?? ""), logoUrl: signed.get(paths[index] ?? "") ?? publicLogoUrl(row),
    }));
    partners.push(...pagePartners);
    rows.forEach((row, index) => {
      const slug = typeof row.slug === "string" ? row.slug : "";
      if (row.is_public === true && ["active", "published"].includes(String(row.status))
        && slug.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        menuCandidates.push({ ...pagePartners[index], href: `/menu/${slug}` });
      }
    });
    if (rows.length < PAGE_SIZE) return { partners, menuCandidates };
  }
}

async function readMenus(candidates: PublicHomeMenu[]) {
  // Reuse the public menu's entitlement gate, including expiry, inactive plans and overrides.
  const result = await Promise.all(candidates.map(async menu =>
    featureCodesAllow(await getCafeFeatureCodes(menu.id), "menu") ? menu : null));
  return result.filter((menu): menu is PublicHomeMenu => menu !== null);
}

/** Preview visibility is stricter than the legacy standalone route; never publish a private brand. */
export async function isPublicHomeMenuSlug(slug: string): Promise<boolean> {
  if (slug.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return false;
  const { data, error } = await createAdminClient().from("cafes")
    .select("id").eq("slug", slug).eq("is_public", true)
    .in("status", ["active", "published"]).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** Explicit public DTO; privileged credentials and full database rows never cross this boundary. */
export async function getPublicHomeCatalog(): Promise<PublicHomeCatalog> {
  try {
    const admin = createAdminClient();
    const [plans, partners] = await Promise.allSettled([readPlans(admin), readPartners(admin)]);
    let menus: PublicHomeMenu[] = [];
    let menusError = partners.status === "rejected";
    if (partners.status === "fulfilled") {
      try { menus = await readMenus(partners.value.menuCandidates); }
      catch { menusError = true; }
    }
    return {
      plans: plans.status === "fulfilled" ? plans.value : [],
      partners: partners.status === "fulfilled" ? partners.value.partners : [],
      menus,
      errors: { plans: plans.status === "rejected", partners: partners.status === "rejected", menus: menusError },
    };
  } catch {
    return { plans: [], partners: [], menus: [], errors: { plans: true, partners: true, menus: true } };
  }
}
