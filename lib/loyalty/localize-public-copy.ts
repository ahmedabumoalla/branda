import "server-only";
import type { LoyaltyCardProgram } from "@/lib/data/loyalty-cards";
import { englishCatalogText } from "@/lib/cashier/catalog-translation";
import { loyaltyText } from "./customer-language";

const programPhrases: Record<string, string> = {
  "رستم": "Rostom",
  "صالونات الحلاقة الرجالية": "Men’s Barbershops",
  "سناك مجاني 🍫": "Free snack 🍫",
  "مشروب او قهوة مجانيه ❤️": "Free drink or coffee ❤️",
  "اي لعبة الكترونية مجانيه😉": "A free electronic game of your choice 😉",
  "قيم لشخصين بولينقو😍": "A bowling game for two at Bolingo 😍",
  "حماية شاشة ملاقيف مجانًا": "Free privacy screen protector",
  "كيبل شحن من الخيارات المحددة مجاناً": "Free charging cable from the available selection",
  "طقم شحن سريع مجانًا (رأس شاحن + كيبل)": "Free fast-charging set with adapter and cable",
  "سماعة بلوتوث لاسلكية مجانًا": "Free wireless Bluetooth headset",
  "بورك بنك شاحن متنقل": "Portable power bank",
  "اختر هديتك من إكسسوارات ماهر برو حتى ١٥٠ ريال": "Choose a Maher Pro accessory worth up to SAR 150",
  "*كوب مجاناً من نيف ☕*\n\nاستبدل نقاطك بكوب قهوة مجاناً من اختيارك - فلتر اليوم أو سبانيش لاتيه.\n\n*قبل الاستبدال:*\n- أظهر البطاقة للباريستا قبل الطلب\n- المكافأة لمرة واحدة فقط\n- بدون إضافات، الإضافات بسعرها\n- ما تنجمع مع أي عرض ثاني\n- ما تتحول لكاش\n\nنورتنا 🤎": "A complimentary coffee from Neef ☕\n\nRedeem your points for the filter coffee of the day or a Spanish latte\n\nShow your card to the barista before ordering. Redeem the reward once. Extras cost their regular price. The reward cannot be combined with another offer or exchanged for cash\n\nWelcome 🤎",
  "شروط الاستحقاق للختم : \n١- لا يستحق ختم على الخدمات الأقل من 100 ريال .\n2- لا يستحق ختم في المناسبات والأعياد مهما كان نوع الخدمة المطلوبة .\n\nتطبق الشروط والأحكام الخاصة بالعلامة التجارية": "Stamp eligibility\n\nServices under SAR 100 do not earn a stamp. During holidays and special occasions, no service earns a stamp\n\nThe brand’s terms and conditions apply",
  "مع بطاقة أهل ماهر برو، تكسب نقطة عن كل ريال تدفعه على الإكسسوارات وخدمات الصيانة المؤهلة في فرع طويق. عند ٢٠٠ نقطة تقدر تستبدلها بحماية شاشة عادية للأجهزة المتوفرة لها الحماية، وعند ٥٠٠ نقطة تقدر تستبدلها بكيبل شحن من الخيارات المحددة في الفرع. تُصرف المكافأة في زيارة لاحقة ويُخصم رصيدها عند الاستبدال. شراء الجوالات خارج برنامج النقاط": "Earn one point for every riyal spent on eligible accessories and repairs at Maher Pro’s Tuwaiq branch. Redeem 200 points for a standard screen protector for an eligible device, or 500 points for a charging cable from the branch selection. Redeem on a later visit. Redeemed points are deducted from your balance. Mobile phone purchases do not earn points",
  "أن تكون قيمة المنتج المجاني ٥٠ ريال فقط \nاو يكون خصم ٥٠ ريال من اجمالي الفاتورة \nوتطبق الشروط والأحكام الخاصة بالعلامة التجارية": "Choose a free product worth SAR 50 or SAR 50 off the total bill. The brand’s terms and conditions apply",
  "قريب منّا؟ خذ لك لحظة قهوة، يسعدنا نشوفك.": "Nearby? Stop by for a coffee. We’d love to see you",
  "قريب منّا ؟ خذ لك لحظة + قهوة تعدل المزاج \nيسعدنا نشوفك": "Nearby? Take a break and join us for coffee. We’d love to see you",
  "زياراتك تجمع المكافآت على سفرة الحديقة": "Earn rewards when you dine at Al Hadiqa",
  "زياراتك تجمع المكافآت على سفرة كورما": "Earn rewards when you dine at Korma",
  "مقهى الكواكب": "Kawakib Coffee",
  "مقهى كاث kath": "Kath Cafe",
  "عيادات الطبيب": "Al Tabib Clinics",
  "تريبل بوينت كافيه": "Triple Point Cafe",
  "سويتش للاتصالات": "Switch Telecom",
  "مركز اثير الرفاهية سبا للمساج": "Atheer Al Rafahiyah Massage Spa",
  "دبل كيك": "Double Cake",
  "شاهي وهيل": "Shahi Wa Hail",
  "ضباب": "Dhabab",
  "واحد معصوب": "Wahed Masoub",
  "فواصل": "Fawasel",
  "الرنة الأخيرة للاتصالات": "Last Ring Telecom",
  "شركة كار الحديثة لزينة السيارات": "Car Modern Auto Accessories",
  "صالون عناية": "Inayah Salon",
  "تسالي شباك طلة": "Tasali Shubbak Tallah",
  "قرمشيات خزز للحوامض والحلويات": "Qarmashiyat Khazaz Sweets and Sour Treats",
  "مقص 77": "Mqas 77",
  "فرن الطابون": "Furn Al Taboon",
  "حلويات الاجوان": "Al Ajwan Sweets",
  "اجويا لاونج": "Agoya Lounge",
  "رستم | صالونات الحلاقة الرجالية": "Rostom Men’s Salons",
  "حلم": "Hilm",
  "عربي": "Arabi",
  "مسالا": "Masala",
  "سديم": "Sadeem",
  "الحديقة": "Al Hadiqa",
  "ريحان و جبنة": "Rehan Wa Jibnah",
  "الحسون سنتر سكاكا": "Al Hassoun Center Sakaka",
  "درب سميحه للشاهي": "Darb Smeha Tea",
  "نيڤ للقهوة المختصة": "Neef Specialty Coffee",
  "شاي والِم": "Tea Walm",
  "صناع القهوة": "Coffee Makers",
  "غرام": "Gharam",
  "تجربة الكوفي": "Coffee Experience",
  "بولينقو": "Bolingo",
  "رواق قهوه مختصه": "Riwaq Specialty Coffee",
  "100 درجة": "100 Degrees",
  "جي بيرسنت": "G Percent",
  "ورد الشام": "Ward Al Sham",
  "فندق رهف المشاعر": "Rahaf Al Mashaer Hotel",
  "ماهر برو للاتصالات": "Maher Pro Telecom",
  "سيما الشرق للفضيات": "Sima Al Sharq Silver",
  "ميرام | meram": "Meram",
  "أولاد العز": "Awlad Al Ezz",
  "جاي وشباتي": "Chai and Chapati",
  "بذرة عمتنا": "Bithrat Ammatna",
  "مجمع حسنين واولاده": "Hasanein and Sons Complex",
  "تازا": "Taza",
  "الركن الفرنسي": "The French Corner",
  "مايند": "Mind",
  "كورما": "Korma",
  "لوكو": "LOCO",
  "كافيين": "Caffeine",
  "CAFFEINE | كافيين": "CAFFEINE",
  "الأختام": "Stamps",
  "مكافأة": "Reward",
  "مشروب مجاني عند اكتمال البطاقة": "Free drink when your card is full",
  "خدمة مجانية عند اكتمال البطاقة": "Free service when your card is full",
  "منتج مجاني": "Free item",
  "اجمع الأختام واستبدل مكافأتك بسهولة": "Collect stamps and redeem your reward",
  "اجمع الأختام واحصل على مكافأتك": "Collect stamps to earn your reward",
  "زياراتك تجمع المكافآت": "Earn rewards with your visits",
  "كل زيارة تقرّب مكافأتك": "Each visit brings you closer to your reward",
  "كل زيارة تقرّبك من مكافأتك": "Each visit brings you closer to your reward",
  "كل زيارة تنمّي مكافأتك": "Grow your reward with every visit",
  "كل زيارة لها أثر": "Every visit counts",
  "كل زيارة تقرّبك من مشروبك المجاني": "Each visit brings you closer to a free drink",
  "لكل رشفة حكاية ولكل زيارة مكافأة": "Every sip tells a story and every visit earns a reward",
  "يحدد التاجر شروط المكافأة قبل تفعيل البرنامج.": "The merchant sets the reward terms before activating the program",
  "قهوة": "Coffee",
  "قهوة وحلا": "Coffee and dessert",
  "مشروب": "Drink",
  "قهوة وتمر": "Coffee and dates",
  "مكافأة تحددها مقهى الكواكب": "Reward chosen by Kawakib Coffee",
  "مشروب مجاني": "Free drink",
  "مشروبك علينا": "A drink on us",
  "قسيمة ب 200 ريال عند اكمال اختامك": "SAR 200 voucher when your card is full",
  "خصم على الخدمة": "Service discount",
  "خصم على الباقات": "Package discount",
  "كوب آيس تي & كركديه . مجاناً.": "Complimentary iced tea and hibiscus drink",
  "مشروب مجاني من اختيارك عند اكتمال الاختام": "Free drink of your choice when your card is full",
  "جمع اختامك واحصل على وجبة معصوب ماكس وسط مجانا": "Collect your stamps to earn a free medium Masoub Max meal",
  "اجمع اختامك وخذ معسل  بنص السعر": "Collect your stamps for half-price shisha",
  "احصل على مزعترة مجانا مع الطلب عند اكتمال الأختام": "Complete your stamps for a free zaatar flatbread with your order",
  "مشروب من إختيارك": "A drink of your choice",
  "مشروب من اختيارك": "A drink of your choice",
  "جمع اختامك واحصل على راس معسل + قهوة او شاهي مجانا": "Collect your stamps for a complimentary shisha bowl and coffee or tea",
  "جمع اختامك واحصل على مكافأة مميزة": "Collect your stamps for a special reward",
  "قسيمه بقيمة 200 ⃁": "SAR 200 voucher",
  "مشروب مجاني من قائمة المنيو": "Free drink from the menu",
  "مشروب من قائمة المنيو مجاني": "Free drink from the menu",
  "خدمة مجانية بقيمة 100 ريال": "Complimentary service worth SAR 100",
  "طلبك المعتاد مجاني": "Your usual order on us",
  "قهوة اليوم الحجم الصغير": "Small coffee of the day",
  "حلاقه مجانا": "Free haircut",
  "قص الشعر مع الحية": "Haircut and beard trim",
  "منتج مجاني ( بقيمة ١٠ ريال)": "Free item worth SAR 10",
  "خصم 20% على اجمالي الفاتورة 😎🔥": "20% off the total bill 😎🔥",
  "خصم 10% على الخدمة عند اكتمال الاختام": "10% off the service when your card is full",
  "خصم 60% عند اكمالك لجمع اختامك": "60% off when your card is full",
  "خصم 20 ريال بعد اكتمال الاختام": "SAR 20 off when your card is full",
  "تستطيع اخذ الهدية بين تاريخ 10 الى 20 الشهر فقط": "Redeem your gift only from the 10th to the 20th of the month",
  "اجمع 5 اختام واحصل على كوب آيس تي & كركديه . مجاناً": "Collect 5 stamps for a complimentary iced tea and hibiscus drink",
  "أكمل 7 أختام واحصل على شيشتك مجاناً": "Complete 7 stamps for a complimentary shisha",
  "اجمع 6 أختام   وأحصل مشروب مجاني من اختيارك من قائمة المشروبات": "Collect 6 stamps for a free drink of your choice from the drinks menu",
  "قريب منّا؟ خذ لك لحظة قهوة يسعدنا نشوفك": "Nearby? Stop by for a coffee. We’d love to see you",
  "قريب منّا؟ حان وقت العناية بإطلالتك يسعدنا نشوفك": "Nearby? Drop in for a fresh look. We’d love to see you"
};

function englishProgramPhrase(source: string) {
  const value = source.trim();
  if (Object.hasOwn(programPhrases, value)) return programPhrases[value];
  const title = /^(?:بطاقة(?: ولاء)?|ولاء) (.+)$/.exec(value);
  if (title && value !== "بطاقة الولاء") {
    const name = title[1];
    if (Object.hasOwn(programPhrases, name)) return `${programPhrases[name]} loyalty card`;
    if (!/\p{Script=Arabic}/u.test(name)) return `${name} loyalty card`;
  }
  const discount = /^خصم (\d+)[٪%]$/.exec(value);
  if (discount) return `${discount[1]}% off`;
  const stampOffer = /^(?:اجمع|أكمل) (\d+) أختام (?:واحصل على|للحصول على) خصم (\d+)[٪%]$/.exec(value);
  if (stampOffer) return `Collect ${stampOffer[1]} stamps for ${stampOffer[2]}% off`;
  const voucher = /^خصم بقيمة (\d+) ريال$/.exec(value);
  if (voucher) return `SAR ${voucher[1]} off`;
  return loyaltyText(source, "en");
}

// Callers pass published merchant copy explicitly. Customer identity, QR codes,
// credentials and membership records never enter the catalog translation request.
export async function englishLoyaltyCopy(values: string[]) {
  const translated = new Map<string, string>();
  await Promise.all([...new Set(values)].filter(Boolean).map(async source => {
    const known = englishProgramPhrase(source);
    translated.set(source, await englishCatalogText(known));
  }));
  return (value: string) => value ? translated.get(value) ?? englishProgramPhrase(value) : value;
}

export function publicProgramCopy(program: LoyaltyCardProgram) {
  return [program.cardTitle, program.cardSubtitle, program.rewardName, program.rewardProductName,
    program.terms, program.stampLabel, ...(program.pointsProgram?.milestones.map(tier => tier.reward) ?? [])];
}

export function localizePublicProgram(program: LoyaltyCardProgram, translate: (source: string) => string): LoyaltyCardProgram {
  return { ...program, cardTitle: translate(program.cardTitle), cardSubtitle: translate(program.cardSubtitle),
    rewardName: translate(program.rewardName), rewardProductName: translate(program.rewardProductName),
    terms: translate(program.terms), stampLabel: translate(program.stampLabel),
    ...(program.pointsProgram ? { pointsProgram: { ...program.pointsProgram,
      milestones: program.pointsProgram.milestones.map(tier => ({ ...tier, reward: translate(tier.reward) })) } } : {}),
  };
}
