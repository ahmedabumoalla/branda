"use server";



import { createClient } from "@/lib/supabase/server";

import { getCafeBySlug } from "@/lib/data/cafes";

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

import {
  escapeEmailHtml,
  isBarndaksaEmailConfigured,
  sendBarndaksaEmail,
} from "@/lib/email/resend";

import type { AppNotification } from "@/lib/mock/notifications";



export async function fetchCustomerOrdersAction(cafeSlug: string) {

  let profile: Awaited<ReturnType<typeof requireCustomerProfileForSession>>["profile"];
  try {
    ({ profile } = await requireCustomerProfileForSession(cafeSlug));
  } catch {
    return [];
  }

  return getCustomerOrdersForProfile(cafeSlug, profile.id as string);

}



export async function fetchCustomerReservationsAction(cafeSlug: string) {

  let profile: Awaited<ReturnType<typeof requireCustomerProfileForSession>>["profile"];
  try {
    ({ profile } = await requireCustomerProfileForSession(cafeSlug));
  } catch {
    return [];
  }

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

type BranchProximityEmailInput = {
  cafeSlug: string;
  branchId: string;
  customerLat: number;
  customerLng: number;
};

function distanceMeters(
  first: { lat: number; lng: number },
  second: { lat: number; lng: number }
) {
  const earthRadius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(second.lat - first.lat);
  const dLng = toRad(second.lng - first.lng);
  const lat1 = toRad(first.lat);
  const lat2 = toRad(second.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeCoordinate(value: number) {
  return Number.isFinite(value) ? Number(value) : null;
}

function cafePageUrl(slug: string) {
  const path = `/c/${encodeURIComponent(slug)}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  return appUrl ? `${appUrl}${path}` : path;
}

export async function sendBranchProximityEmailAction(input: BranchProximityEmailInput) {
  const cafeSlug = input.cafeSlug.trim().toLowerCase();
  const branchId = input.branchId.trim();
  const customerLat = normalizeCoordinate(input.customerLat);
  const customerLng = normalizeCoordinate(input.customerLng);

  if (!cafeSlug || !branchId || customerLat == null || customerLng == null) {
    return { ok: true, sent: false };
  }

  let profile: Awaited<ReturnType<typeof requireCustomerProfileForSession>>["profile"];
  try {
    ({ profile } = await requireCustomerProfileForSession(cafeSlug));
  } catch {
    return { ok: true, sent: false };
  }
  const customerEmail = String(profile.email ?? "").trim().toLowerCase();
  if (!customerEmail) return { ok: true, sent: false };

  const cafe = await getCafeBySlug(cafeSlug);
  if (!cafe) return { ok: true, sent: false };

  const supabase = await createClient();
  const { data: branch, error } = await supabase
    .from("branches")
    .select("id,cafe_id,name,lat,lng,geofence_radius_m,active,deleted_at")
    .eq("id", branchId)
    .eq("cafe_id", cafe.id)
    .eq("active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !branch) return { ok: true, sent: false };

  const branchLat = normalizeCoordinate(Number(branch.lat));
  const branchLng = normalizeCoordinate(Number(branch.lng));
  if (branchLat == null || branchLng == null) return { ok: true, sent: false };

  const radius = Number(branch.geofence_radius_m ?? 50);
  const geofenceRadiusM = Number.isFinite(radius) && radius > 0 ? radius : 50;
  const distance = distanceMeters(
    { lat: customerLat, lng: customerLng },
    { lat: branchLat, lng: branchLng }
  );

  if (distance > geofenceRadiusM) return { ok: true, sent: false };
  if (!isBarndaksaEmailConfigured()) return { ok: true, sent: false };

  const customerName = String(profile.full_name ?? "عميل");
  const cafeName = String(cafe.name ?? cafeSlug);
  const branchName = String(branch.name ?? "الفرع");
  const href = cafePageUrl(cafeSlug);
  const subject = `أهلًا بك بالقرب من ${cafeName}`;

  try {
    await sendBarndaksaEmail({
      to: customerEmail,
      subject,
      text: `أهلًا ${customerName}
${cafeName} ترحب بك بالقرب من ${branchName}
تفحص جديدنا، ممكن فيه شيء فاتك اليوم.
${href}`,
      html: `<div dir="rtl" align="right" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8;color:#311912">
  <p>أهلًا ${escapeEmailHtml(customerName)}</p>
  <p><strong>${escapeEmailHtml(cafeName)}</strong> ترحب بك بالقرب من <strong>${escapeEmailHtml(branchName)}</strong></p>
  <p>تفحص جديدنا، ممكن فيه شيء فاتك اليوم.</p>
  <p><a href="${escapeEmailHtml(href)}" style="display:inline-block;background:#6B3A25;color:#FCF8F3;text-decoration:none;padding:12px 18px;border-radius:14px;font-weight:700">فتح صفحة العلامة</a></p>
</div>`,
    });
    return { ok: true, sent: true };
  } catch {
    return { ok: true, sent: false };
  }
}

