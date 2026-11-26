export const ownerCompanionGuides = {
  setup: {
    url: "https://barndaksa.com/guides/owner-loyalty-setup-20261118.mp4",
    filename: "branda-loyalty-account-setup.mp4",
    caption: "١ من ٣ — إعداد حساب الولاء\nيوضح هذا المقطع كيف تجهز حسابك وبطاقة الولاء من لوحة التحكم\nإذا احتجت مساعدة في أي خطوة رد علينا هنا",
  },
  cashier: {
    url: "https://barndaksa.com/guides/cashier-loyalty-20261118.mp4",
    filename: "branda-loyalty-cashier.mp4",
    caption: "٢ من ٣ — كيف يستخدم الكاشير نظام الولاء\nأضف الموظف أولًا من إدارة الكاشير في لوحة التحكم ثم يفتح رابط الكاشير الخاص به\nيوضح هذا المقطع كيف يقرأ بطاقة العميل أو يدخل رقم جواله ويسجل له ختمًا وكيف يصرف المكافأة",
  },
  customer: {
    url: "https://barndaksa.com/guides/customer-loyalty-card-20261119.mp4",
    filename: "branda-customer-loyalty-card.mp4",
    caption: "٣ من ٣ — كيف يحمل العميل بطاقة الولاء\nشارك العميل رابط التسجيل أو باركود الولاء الخاص بعلامتك\nيوضح هذا المقطع خطوات التسجيل وتحميل البطاقة في محفظة الجوال ثم عرضها للكاشير لتسجيل الأختام",
  },
} as const;
export type OwnerCompanionGuide = keyof typeof ownerCompanionGuides;
