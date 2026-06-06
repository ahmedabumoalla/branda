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

