"use client";

import { MessageSquareText, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { getCustomerSession } from "@/lib/customer/session";
import { REVIEWS_KEY, mockReviews, type CafeReview } from "@/lib/mock/reviews";

export function ProductReviews({ slug, productId, productName }: { slug: string; productId: string; productName: string }) {
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
      window.location.href = `/c/${slug}/login?next=/c/${slug}/product/${productId}`;
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
    <section className="mt-10 rounded-[32px] border border-[#E5D8CD] bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-2xl font-black text-[#3A2117]">
        <MessageSquareText className="h-6 w-6" />
        الأسئلة والتقييمات
      </h2>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          {productReviews.length ? (
            productReviews.map((review) => (
              <article key={review.id} className="rounded-2xl bg-[#F8F4EF] p-4">
                <div className="flex justify-between gap-3">
                  <h3 className="font-black">{review.customerName}</h3>
                  <div className="flex gap-1 text-[#8B5E3C]">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-4 w-4 ${i < review.rating ? "fill-current" : ""}`} />
                    ))}
                  </div>
                </div>
                <p className="mt-2 text-[#7A6255]">{review.comment}</p>
                {review.question ? <p className="mt-2 font-bold text-[#3A2117]">سؤال: {review.question}</p> : null}
                {review.answer ? <p className="mt-2 rounded-2xl bg-white p-3 font-bold text-[#6B3A25]">رد الكوفي: {review.answer}</p> : null}
              </article>
            ))
          ) : (
            <p className="rounded-2xl bg-[#F8F4EF] p-5 text-[#7A6255]">لا توجد تقييمات على هذا المنتج حتى الآن.</p>
          )}
        </div>

        <aside className="rounded-2xl bg-[#F8F4EF] p-4">
          <p className="font-black text-[#3A2117]">أضف تقييمك أو سؤالك</p>

          <select value={rating} onChange={(e) => setRating(Number(e.target.value))} className="mt-3 h-12 w-full rounded-2xl border border-[#E5D8CD] px-4 outline-none">
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>{n} نجوم</option>
            ))}
          </select>

          <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="تعليقك على المنتج" className="mt-3 h-24 w-full resize-none rounded-2xl border border-[#E5D8CD] p-4 text-right outline-none" />
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="سؤالك عن المنتج" className="mt-3 h-24 w-full resize-none rounded-2xl border border-[#E5D8CD] p-4 text-right outline-none" />

          <button onClick={submitReview} className="mt-3 h-12 w-full rounded-2xl bg-[#3A2117] font-black text-[#F8E8D2]">
            إرسال
          </button>
        </aside>
      </div>
    </section>
  );
}