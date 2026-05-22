"use client";

import { MessageSquareText, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { REVIEWS_KEY, mockReviews, type CafeReview } from "@/lib/mock/reviews";

export function ReviewsPageClient() {
  const [reviews, setReviews] = useState<CafeReview[]>(mockReviews);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const saved = localStorage.getItem(REVIEWS_KEY);
    if (saved) setReviews(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem(REVIEWS_KEY, JSON.stringify(reviews));
  }, [reviews]);

  const avgRating = useMemo(() => {
    if (!reviews.length) return 0;
    return reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length;
  }, [reviews]);

  function saveReply(id: string) {
    const answer = replyDrafts[id]?.trim();
    if (!answer) return;

    setReviews((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, answer, status: "ظاهر" } : item
      )
    );
  }

  return (
    <div dir="rtl" className="min-h-screen px-6 py-8 text-[#2B1710]">
      <header className="mb-8">
        <p className="font-black text-[#8B5E3C]">لوحة برندة</p>
        <h1 className="mt-2 text-4xl font-black text-[#3A2117]">الأسئلة والتقييمات</h1>
        <p className="mt-2 text-[#7A6255]">إدارة تعليقات العملاء وأسئلتهم تحت المنتجات.</p>
      </header>

      <section className="mb-8 grid gap-5 md:grid-cols-3">
        <div className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
          <p className="font-black text-[#7A6255]">عدد التقييمات</p>
          <h2 className="mt-3 text-4xl font-black">{reviews.length}</h2>
        </div>
        <div className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
          <p className="font-black text-[#7A6255]">متوسط التقييم</p>
          <h2 className="mt-3 text-4xl font-black">{avgRating.toFixed(1)}</h2>
        </div>
        <div className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
          <p className="font-black text-[#7A6255]">بانتظار الرد</p>
          <h2 className="mt-3 text-4xl font-black">
            {reviews.filter((r) => !r.answer).length}
          </h2>
        </div>
      </section>

      <section className="grid gap-5">
        {reviews.map((review) => (
          <article key={review.id} className="rounded-3xl border border-white bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="font-black text-[#8B5E3C]">{review.productName}</p>
                <h2 className="mt-1 text-2xl font-black text-[#3A2117]">{review.customerName}</h2>
                <div className="mt-2 flex gap-1 text-[#8B5E3C]">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`h-5 w-5 ${i < review.rating ? "fill-current" : ""}`} />
                  ))}
                </div>
              </div>

              <span className="rounded-full bg-[#F8F4EF] px-4 py-2 text-xs font-black text-[#6B3A25]">
                {review.status}
              </span>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl bg-[#F8F4EF] p-4">
                <p className="mb-2 flex items-center gap-2 font-black">
                  <MessageSquareText className="h-5 w-5" />
                  تعليق العميل
                </p>
                <p className="text-[#7A6255]">{review.comment}</p>
                {review.question ? <p className="mt-3 font-bold text-[#3A2117]">سؤال: {review.question}</p> : null}
              </div>

              <div className="rounded-2xl bg-[#F8F4EF] p-4">
                <p className="mb-2 font-black">رد الكوفي</p>
                <textarea
                  value={replyDrafts[review.id] ?? review.answer ?? ""}
                  onChange={(e) =>
                    setReplyDrafts((prev) => ({ ...prev, [review.id]: e.target.value }))
                  }
                  placeholder="اكتب رد الكوفي..."
                  className="h-24 w-full resize-none rounded-2xl border border-[#E5D8CD] p-4 text-right outline-none"
                />
                <button
                  onClick={() => saveReply(review.id)}
                  className="mt-3 rounded-2xl bg-[#3A2117] px-5 py-3 font-black text-[#F8E8D2]"
                >
                  حفظ الرد
                </button>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() =>
                  setReviews((prev) =>
                    prev.map((item) =>
                      item.id === review.id
                        ? { ...item, status: item.status === "ظاهر" ? "مخفي" : "ظاهر" }
                        : item
                    )
                  )
                }
                className="rounded-2xl bg-[#F8F4EF] px-5 py-3 font-black text-[#3A2117]"
              >
                {review.status === "ظاهر" ? "إخفاء" : "إظهار"}
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}