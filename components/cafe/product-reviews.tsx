"use client";

import { MessageSquareText, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { getCustomerSession } from "@/lib/customer/session";
import { REVIEWS_KEY, mockReviews, type CafeReview } from "@/lib/mock/reviews";
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
  const [reviews, setReviews] = useState<CafeReview[]>(mockReviews);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [question, setQuestion] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(REVIEWS_KEY);
    if (saved) setReviews(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem(REVIEWS_KEY, JSON.stringify(reviews));
  }, [reviews]);

  const productReviews = reviews.filter((r) => r.productId === productId && r.status === "ظاهر");

  function submitReview() {
    const customer = getCustomerSession(slug);

    if (!customer) {
      const next = appendPreviewToNextPath(`/c/${slug}/product/${productId}`, previewThemeId);
      window.location.href = `/c/${slug}/login?next=${encodeURIComponent(next)}`;
      return;
    }

    if (!comment.trim() && !question.trim()) {
      alert("اكتب تعليق أو سؤال");
      return;
    }

    const review: CafeReview = {
      id: crypto.randomUUID(),
      cafeSlug: slug,
      productId,
      productName,
      customerId: customer.id,
      customerName: customer.fullName,
      rating,
      comment: comment.trim() || "بدون تعليق",
      question: question.trim() || undefined,
      status: "بانتظار الرد",
      createdAt: new Date().toISOString().slice(0, 10),
    };

    setReviews((prev) => [review, ...prev]);
    setComment("");
    setQuestion("");
    alert("تم إرسال تقييمك وسيظهر بعد المراجعة");
  }

  return (
    <section className={`mt-10 p-6 ${theme.card}`}>
      <h2 className={`flex items-center gap-2 text-2xl font-black ${experience.headingTracking}`}>
        <MessageSquareText className="h-6 w-6" />
        الأسئلة والتقييمات
      </h2>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          {productReviews.length ? (
            productReviews.map((review) => (
              <article key={review.id} className={`rounded-2xl p-4 ${theme.buttonOutline}`}>
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

        <aside className={`rounded-2xl p-4 ${theme.buttonOutline}`}>
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
            onClick={submitReview}
            className={`mt-3 h-12 w-full font-black ${theme.button}`}
          >
            إرسال
          </button>
        </aside>
      </div>
    </section>
  );
}
