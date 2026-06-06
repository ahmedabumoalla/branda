"use server";

import { getOwnerReviews, replyToReview } from "@/lib/data/reviews";

export async function fetchOwnerReviewsAction() {
  return getOwnerReviews();
}

export async function replyToReviewAction(reviewId: string, answer: string) {
  await replyToReview(reviewId, answer);
}
