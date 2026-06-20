"use client";

import { MessageSquareText, Star } from "lucide-react";
import { useEffect, useState } from "react";
import {
  fetchProductReviewsAction,
  submitProductReviewAction,
} from "@/app/actions/customer";
import { getCustomerSession } from "@/lib/customer/session";
import { type CafeReview } from "@/lib/mock/reviews";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";
import { appendPreviewToNextPath } from "@/lib/cafe/theme-links";
import { ThemedTextarea } from "@/components/cafe/themes/themed-reservation-panel";

export function ProductReviews({
  slug,
  productId,
  productName,
  experience,
  previewThemeId,
}: {
  slug: string;
  productId: string;
  productName: string;
  experience: ThemeExperience;
  previewThemeId?: string | null;
}) {
  const { theme } = experience;
  const [reviews, setReviews] = useState<CafeReview[]>([]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void fetchProductReviewsAction(slug, productId)
      .then(setReviews)
      .finally(() => setLoading(false));
  }, [slug, productId]);

  const productReviews = reviews.filter((r) => r.productId === productId && r.status === "ظاهر");

  async function submitReview() {
    const customer = await getCustomerSession(slug);

    if (!customer) {
      const next = appendPreviewToNextPath(`/c/${slug}/product/${productId}`, previewThemeId);
      window.location.href = `/c/${slug}/login?next=${encodeURIComponent(next)}`;
      return;
    }

    if (!comment.trim() && !question.trim()) {
      alert("اكتب تعليق أو سؤال");
      return;
    }

    setSubmitting(true);
    try {
      await submitProductReviewAction({
        cafeSlug: slug,
        productId,
        customerId: customer.id,
        customerName: customer.fullName,
        rating,
        comment: comment.trim() || question.trim(),
      });
      setComment("");
      setQuestion("");
      alert("تم إرسال تقييمك وسيظهر بعد المراجعة");
      const next = await fetchProductReviewsAction(slug, productId);
      setReviews(next);
    } catch {
      alert("تعذر إرسال التقييم");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={`p-4 sm:p-5 ${theme.card}`}>
      <h2 className={`flex items-center gap-2 text-xl font-black ${experience.headingTracking}`}>
        <MessageSquareText className="h-5 w-5" />
        الأسئلة والتقييمات
      </h2>

      {loading ? (
        <p className={`mt-6 ${theme.muted}`}>جاري التحميل...</p>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            {productReviews.length ? (
              productReviews.map((review) => (
                <article key={review.id} className={`rounded-2xl p-4 text-sm ${theme.buttonOutline}`}>
                  <div className="flex justify-between gap-3">
                    <h3 className="font-black">{review.customerName}</h3>
                    <div className={`flex gap-1 ${theme.accent}`}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`h-4 w-4 ${i < review.rating ? "fill-current" : ""}`} />
                      ))}
                    </div>
                  </div>
                  <p className={`mt-2 ${theme.muted}`}>{review.comment}</p>
                  {review.question ? (
                    <p className="mt-2 font-bold">سؤال: {review.question}</p>
                  ) : null}
                  {review.answer ? (
                    <p className={`mt-2 rounded-2xl p-3 font-bold ${theme.card}`}>
                      رد الكوفي: {review.answer}
                    </p>
                  ) : null}
                </article>
              ))
            ) : (
              <p className={`rounded-2xl p-5 ${theme.muted}`}>لا توجد تقييمات على هذا المنتج حتى الآن.</p>
            )}
          </div>

          <aside className={`rounded-2xl p-4 text-sm ${theme.buttonOutline}`}>
            <p className="font-black">أضف تقييمك أو سؤالك</p>

            <select
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              className={`mt-3 w-full ${experience.formInput}`}
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} نجوم
                </option>
              ))}
            </select>

            <ThemedTextarea
              experience={experience}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="تعليقك على المنتج"
              className="mt-3 h-24"
            />
            <ThemedTextarea
              experience={experience}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="سؤالك عن المنتج"
              className="mt-3 h-24"
            />

            <button
              type="button"
              onClick={() => void submitReview()}
              disabled={submitting}
              className={`mt-3 h-12 w-full font-black disabled:opacity-60 ${theme.button}`}
            >
              {submitting ? "جاري الإرسال..." : "إرسال"}
            </button>
          </aside>
        </div>
      )}
    </section>
  );
}
