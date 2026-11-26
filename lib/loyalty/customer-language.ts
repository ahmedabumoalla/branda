export type LoyaltyLanguage = "ar" | "en";

export function loyaltyLanguage(requested: unknown): LoyaltyLanguage {
  return requested === "en" ? "en" : "ar";
}

// Match the owner's published wording exactly. New offers and terms keep their
// original wording until an English translation for that revision is available.
const englishCopy: Record<string, string> = {
  "الفروج الشامي | فرع القاسية": "Al Farouj Al Shami | Al Qasiyah Branch",
  "الفروج الشامي": "Al Farouj Al Shami",
  "فرع القاسية": "Al Qasiyah Branch",
  "صحصحنا وصحصح جوعك! 😍☀️\n\nفطورك الشامي الطيب ناطرك!\nخمير وفطير وكاسة شاي على الأصول ☕❤️\n\nصباحك أحلى معنا!": "Rise and shine! 😍☀️ Your Syrian breakfast is waiting: khameer, pastries and a proper cup of tea ☕❤️",
  "😋 لسا ما تغدّيت؟ شو ناطر!\n\nغداك الشامي الطيب صار جاهز!\nفروج مشوي، مشاوي وأطيب الأكلات الشامية 🍗🔥\n\nقرّب علينا، غداك علينا إلو طعمة تانية ❤️\nالفروج الشامي – فرع القاسمية": "Still thinking about lunch? 😋 Join us for grilled chicken, mixed grills and Syrian specialties 🍗🔥 Al Farouj Al Shami – Al Qasimia Branch",
  "وينك؟ 😍\nتعال جيب رفقاتك وتعالوا اسهروا عنا، ناطرينكم بلمة حلوة وجو شامي أصيل ❤️\nالقعدة بتحلى بوجودكم، ومنورين الفروج الشامي! 🔥": "Bring your friends for an evening of Syrian hospitality ❤️ We’d love to see you at Al Farouj Al Shami! 🔥",
  "بطاقة الولاء": "Loyalty card",
  "ختم": "Stamps",
  "لقمة اهل الشام": "Luqmat Ahl Al Sham",
  "تطبق الشروط والأحكام الخاصة بالعلامة التجارية": "The brand’s terms and conditions apply",
  "شو رأيك باستراحة حلوة؟ 😍 قريب منّا؟ تعال دلّل حالك بكاسة شاي وخمير وفطير، نورتنا سلف": "Nearby? Take a break and join us for tea, khameer and pastries 😍",
  "مساء الخير من الفروج الشامي ❤️": "Good evening from Al Farouj Al Shami ❤️",
  "لا تنسوا تخبروا رفقاتكم وأهلكم عن خدمتنا الجديدة برنامج الولاء، وشاركوهم تجربتكم معنا حتى يستفيد أكبر عدد ممكن من هالميزة الحلوة.\n\nوجودكم معنا بيسعدنا، ومشاركتكم إلنا بتكبر عيلتنا ❤️\n\nالفروج الشامي – نكهة أهل": "Tell your friends and family about our new loyalty program and share your experience so they can enjoy it too\n\nWe love having you with us ❤️\n\nAl Farouj Al Shami",
  "شروط احتساب الزيارات في برنامج الولاء:": "How visits count toward your reward",
  "1. يجب أن تكون قيمة الفاتورة 25 درهماً على الأقل حتى يتم احتساب الزيارة.": "1. A purchase must total at least AED 25 to earn a visit",
  "2. الفواتير التي تقل قيمتها عن 25 درهماً لا تمنح أي نقاط أو زيارات.": "2. Purchases under AED 25 do not earn points or visits",
  "3. يتم احتساب زيارة واحدة فقط لكل زيارة فعلية، ولا يمكن تقسيم المشتريات إلى أكثر من فاتورة للحصول على نقاط إضافية.": "3. Each visit counts once. Splitting a purchase across receipts does not earn extra points",
  "4. يحصل العميل على المكافأة بعد إتمام 10 زيارات مستوفية لشروط البرنامج.": "4. You earn the reward after 10 qualifying visits",
  "5. الفواتير الملغاة أو المبالغ المستردة لا تدخل ضمن احتساب الزيارات.": "5. Cancelled or refunded purchases do not count",
  "6. يجب أن تكون كل زيارة مرتبطة بعملية شراء فعلية ومستوفية للحد": "6. Each visit must be linked to a purchase that meets the minimum spend",
  "أدخل اسمك ورقم جوالك بشكل صحيح": "Enter your name and mobile number",
  "برنامج الولاء غير متاح حاليًا": "The loyalty program is currently unavailable",
  "أدخل رقم جوال صحيحًا مع مفتاح الدولة": "Enter a valid mobile number with its country code",
  "أدخل رقم جوال صحيح لدولة العلامة": "Enter a valid mobile number for this country",
  "محاولات كثيرة انتظر قليلًا ثم حاول مجددًا": "Too many attempts. Please wait a moment and try again",
  "تعذر فتح البطاقة تأكد من الاسم المسجّل ورقم الجوال أو تواصل مع العلامة": "Check your registered name and mobile number or contact the brand",
  "تعذر إكمال التسجيل حاول لاحقًا": "We couldn’t complete your registration. Please try again later",
};

export function loyaltyText(value: string, language: LoyaltyLanguage): string {
  if (language !== "en") return value;
  const lookup = (text: string) => Object.hasOwn(englishCopy, text.trim()) ? englishCopy[text.trim()] : text;
  return Object.hasOwn(englishCopy, value.trim()) ? lookup(value) : value.split("\n").map(lookup).join("\n");
}
