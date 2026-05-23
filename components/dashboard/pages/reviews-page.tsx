"use client";

import { MessageSquareText, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  NeumoTextarea,
  PrimaryButton,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
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
    <div dir="rtl">
      <DashboardPageShell
        title="الأسئلة والتقييمات"
        subtitle="إدارة تعليقات العملاء وأسئلتهم تحت المنتجات."
      >
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label="عدد التقييمات" value={reviews.length} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="متوسط التقييم" value={avgRating.toFixed(1)} />
          </BentoCard>
          <BentoCard variant="white" span="2">
            <StatPill
              label="بانتظار الرد"
              value={reviews.filter((r) => !r.answer).length}
            />
          </BentoCard>
        </BentoGrid>

        <BentoGrid>
          <BentoCard variant="white" span="4">
            <section className="grid gap-5">
              {reviews.map((review) => (
                <SoftCard key={review.id}>
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="font-black text-[#6B3A25]">{review.productName}</p>
                  <h2 className="mt-1 text-2xl font-black text-[#3A2117]">
                    {review.customerName}
                  </h2>
                  <div className="mt-2 flex gap-1 text-[#6B3A25]">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-5 w-5 ${i < review.rating ? "fill-current" : ""}`}
                      />
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
                  {review.question ? (
                    <p className="mt-3 font-bold text-[#3A2117]">
                      سؤال: {review.question}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-2xl bg-[#F8F4EF] p-4">
                  <p className="mb-2 font-black">رد الكوفي</p>
                  <NeumoTextarea
                    value={replyDrafts[review.id] ?? review.answer ?? ""}
                    onChange={(e) =>
                      setReplyDrafts((prev) => ({ ...prev, [review.id]: e.target.value }))
                    }
                    placeholder="اكتب رد الكوفي..."
                    className="h-24"
                  />
                  <PrimaryButton
                    onClick={() => saveReply(review.id)}
                    className="mt-3 px-5 py-3"
                  >
                    حفظ الرد
                  </PrimaryButton>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() =>
                    setReviews((prev) =>
                      prev.map((item) =>
                        item.id === review.id
                          ? {
                              ...item,
                              status: item.status === "ظاهر" ? "مخفي" : "ظاهر",
                            }
                          : item
                      )
                    )
                  }
                  className="rounded-2xl bg-[#F8F4EF] px-5 py-3 font-black text-[#3A2117]"
                >
                  {review.status === "ظاهر" ? "إخفاء" : "إظهار"}
                </button>
              </div>
                </SoftCard>
              ))}
            </section>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
    </div>
  );
}
