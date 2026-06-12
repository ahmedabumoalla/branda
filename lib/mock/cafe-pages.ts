export type CafeInfoPage = {
  id: string;
  title: string;
  slug: string;
  description: string;
  content: string;
  visible: boolean;
  updatedAt: string;
};

export const CAFE_PAGES_KEY = "barndaksa_qatrah_pages";

export const mockCafePages: CafeInfoPage[] = [
  {
    id: "about",
    title: "من نحن",
    slug: "about",
    description: "تعريف مختصر عن الكوفي وتجربته.",
    content: "كوفي قطرة يقدم تجربة قهوة مميزة تجمع بين الجودة والراحة والطلب الرقمي السهل.",
    visible: true,
    updatedAt: "2026-05-22",
  },
  {
    id: "policy",
    title: "سياسة الحجز",
    slug: "reservation-policy",
    description: "الشروط العامة للحجز.",
    content: "يرجى الحضور قبل موعد الحجز بـ 10 دقائق. يتم تأكيد الحجز بعد موافقة الكوفي.",
    visible: true,
    updatedAt: "2026-05-22",
  },
  {
    id: "faq",
    title: "الأسئلة الشائعة",
    slug: "faq",
    description: "إجابات الأسئلة المتكررة للعملاء.",
    content: "هل يوجد حجز؟ نعم. هل يوجد نقاط ولاء؟ نعم، حسب إعدادات الكوفي.",
    visible: true,
    updatedAt: "2026-05-22",
  },
];