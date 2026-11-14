// Original bilingual names from the reviewed MIND hospital menu PDF import
// Do not translate customer-authored additions or invent unavailable variants
const productNames: Record<string, string> = {
  "أمريكانو": "Americano",
  "إسبريسو فردي": "Single espresso",
  "إسبريسو دبل": "Double espresso",
  "لاتيه": "Latte",
  "كابتشينو": "Cappuccino",
  "فلات وايت": "Flat white",
  "كورتادو": "Cortado",
  "ميكاتو": "Macchiato",
  "هوت شوكليت": "Hot chocolate",
  "سبانش لاتيه": "Spanish latte",
  "آيس أمريكانو": "Iced Americano",
  "آيس لاتيه": "Iced latte",
  "آيس سبانش لاتيه": "Iced Spanish latte",
  "آيس ماتشا": "Iced matcha",
  "آيس ماتشا كلاود": "Iced matcha cloud",
  "قهوة اليوم حار": "Hot coffee of the day",
  "قهوة اليوم بارد": "Iced coffee of the day",
  "V60 كولومبي": "Colombian V60",
  "V60 كوستاريكا": "Costa Rican V60",
  "V60 يمني فاخر": "Premium Yemeni V60",
  "V60 إثيوبي": "Ethiopian V60",
  "V60 ليتشي": "Lychee V60",
  "V60 أناناس فاخر": "Premium pineapple V60",
  "V60 كنكات فاخر": "Premium Kankat V60",
  "كروسان باللوز": "Almond croissant",
  "كروسان بالزبدة": "Butter croissant",
  "كروسان أفوكادو وبسطرمة": "Avocado and pastrami croissant",
  "كروسان أركان تشيز": "Arkan cheese croissant",
  "كروسان ديك رومي": "Turkey croissant",
  "كروسان مانجو": "Mango croissant",
  "كروسان فراولة": "Strawberry croissant",
  "كروسان دبل شوكليت": "Double chocolate croissant",
  "كروسان أفوكادو بالبيض": "Avocado and egg croissant",
  "كروسان وايت شوكليت": "White chocolate croissant",
  "أوصال لحم": "Grilled beef awsal cubes",
  "أوصال دجاج": "Grilled chicken awsal cubes",
  "كباب دجاج": "Grilled minced chicken kebab",
  "كباب لحم": "Grilled minced beef kebab",
  "أرز برياني": "Biryani rice",
  "سمك فيليه مقلي": "Fried fish fillet",
  "بشاميل": "Baked macaroni bechamel",
  "خضار مشكل": "Mixed vegetables",
  "حمص": "Hummus",
  "سلطة خضراء": "Green salad",
  "سلطة بطاطس": "Potato salad",
  "أرز أبيض": "White rice",
  "طاجن سمك": "Fish casserole",
  "مكرونة صيني": "Chinese noodles",
  "مسقعة تركي": "Turkish moussaka",
  "متبل تركي": "Turkish roasted eggplant mutabbal",
  "فتوش": "Fattoush",
  "سمك وبطاطس": "Fish and potatoes",
  "أربيتا": "Arrabbiata pasta",
  "حمص يونانية": "Greek style hummus",
  "ملفوف": "Cabbage salad",
  "أرز بشاور": "Peshawar rice",
  "شرقية": "Eastern salad",
  "سباغيتي": "Spaghetti",
  "إيدام بطاطس": "Potato stew",
  "غنوج": "Baba ghanoush",
  "سيزر": "Caesar salad",
  "بطاطس": "Potatoes",
  "سمك مشوي": "Grilled fish",
  "فتشيني": "Fettuccine",
  "بامية": "Okra stew"
};

export type HospitalLocale = "ar" | "en";
const categoryNames: Record<string, string> = {
  "القهوة": "Coffee", "الكروسان": "Croissants", "السبت": "Saturday", "الأحد": "Sunday", "الاثنين": "Monday", "الثلاثاء": "Tuesday", "الأربعاء": "Wednesday", "الخميس": "Thursday", "الجمعة": "Friday",
};
export function hospitalProductName(name: string, locale: HospitalLocale) {
  return locale === "en" ? productNames[name.trim()] ?? name : name;
}
export function hospitalCategoryName(name: string, locale: HospitalLocale) {
  return locale === "en" ? categoryNames[name.trim()] ?? name : name;
}
export function hospitalProductDescription(description: string, locale: HospitalLocale) {
  return locale === "en" ? description.replace(/مل(?=\s|$)/gu, "ml").replace(/جم(?=\s|$)/gu, "g") : description;
}
