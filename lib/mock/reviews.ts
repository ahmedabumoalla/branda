export type CafeReviewStatus = "ظاهر" | "مخفي" | "بانتظار الرد";

export type CafeReview = {
  id: string;
  cafeSlug: string;
  productId: string;
  productName: string;
  customerId: string;
  customerName: string;
  rating: number;
  comment: string;
  question?: string;
  answer?: string;
  status: CafeReviewStatus;
  createdAt: string;
};

export const REVIEWS_KEY = "branda_qatrah_reviews";

export const mockReviews: CafeReview[] = [
  {
    id: "1",
    cafeSlug: "qatrah",
    productId: "1",
    productName: "لاتيه فانيلا",
    customerId: "mock_customer_1",
    customerName: "عبدالله",
    rating: 5,
    comment: "الطعم ممتاز والتقديم جميل.",
    question: "هل متوفر بحليب لوز؟",
    answer: "نعم متوفر حسب الطلب.",
    status: "ظاهر",
    createdAt: "2026-05-22",
  },
];