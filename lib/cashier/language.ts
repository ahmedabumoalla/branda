import { cashierEnglish } from "./messages";

export type CashierLocale = "ar" | "en";
export type LocalizedText = { ar: string; en: string };
export type CashierMessage = string | { text: string; values: Record<string, string | number | LocalizedText> };
export const cashierLanguageCookie = "branda-cashier-language";
const readEnglish: Record<string, string> = {
  "تسجيل الختم": "Record stamp",
  "جاري حفظ القراءة": "Saving scan",
  "تمت قراءة الرمز اضغط تسجيل الختم": "Code scanned Press Record stamp",
  "هذه القراءة محفوظة مسبقًا وتنتظر المزامنة": "This scan is already saved and awaiting sync",
  "تم حفظ القراءة على هذا الجهاز يمكنك خدمة العميل التالي وتابع النتيجة في سجل القراءة": "Scan saved on this device You can serve the next customer and follow the result in scan history",
  "تعذر حفظ القراءة على الجهاز لم تُرسل العملية احتفظ بالرقم وحاول مجددًا": "Could not save this scan Nothing was sent Keep the number and try again",
  "أدخل البطاقة أو رقم الجوال ثم اضغط تسجيل الختم تُحفظ القراءة فورًا ويبحث النظام عن العميل ويسجل الختم في الخلفية": "Enter a card or phone number and press Record stamp The scan is saved immediately while the customer is found and stamped in the background",
  "رقم الجوال ينشئ بطاقة تلقائيًا للعميل الجديد ويسجل أول ختم": "A phone number automatically creates a card and records the first stamp for a new customer",
  "ثبّت المؤشر داخل الحقل ثم امسح بالقارئ زر الإدخال يحفظ طلب تسجيل ختم واحد": "Focus the input and scan Pressing Enter saves one stamp request",
  "الحفظ على الجهاز لا يعني اكتمال الختم انتظر حالة تم تسجيل الختم في السجل ولا تمسح بيانات المتصفح قبل المزامنة": "Saved on device does not mean stamped Wait for Recorded in the history and do not clear browser data before syncing",
  "سجل القراءة على هذا الجهاز": "Scan history on this device",
  "{count} بانتظار المزامنة": "{count} awaiting sync",
  "تتحدث النتائج تلقائيًا ويمكن للإدارة مراجعة العمليات الفاشلة وإعادة مزامنتها من لوحة التحكم": "Results update automatically Management can review and retry failed operations from the dashboard",
  "توقفت المزامنة تحقق من صلاحية الحساب والخدمة ثم سجّل الدخول بالحساب نفسه لاستكمال القراءات المحفوظة": "Sync paused Check your account and service access then sign in with the same account to continue saved scans",
  "تخزين الجهاز غير متاح لا تغلق الصفحة قبل التأكد من حفظ القراءة": "Device storage is unavailable Do not close this page until your scan is saved",
  "تم تسجيل الختم": "Stamp recorded",
  "عملية مكررة لم يُضف ختم": "Duplicate No stamp added",
  "فشلت العملية": "Operation failed",
  "تحتاج مراجعة": "Needs review",
  "محفوظ على الجهاز": "Saved on device",
  "بانتظار المزامنة": "Awaiting sync",
  "قراءة العميل": "Customer scan",
  "اكتملت البطاقة واستحق العميل مكافأة يمكنك صرفها من قسم صرف مكافأة": "Card complete The customer earned a reward Redeem it from the Redeem reward tab",
  "ستظهر نتيجة كل قراءة هنا بعد حفظها": "Each scan result appears here after it is saved",
};
export function cashierLocale(value: unknown): CashierLocale { return value === "en" ? "en" : "ar"; }
export function cashierText(locale: CashierLocale, message: CashierMessage) {
  const source = typeof message === "string" ? message : message.text;
  const translated = locale === "en" ? readEnglish[source] ?? cashierEnglish[source] ?? source : source;
  return typeof message === "string" ? translated : translated.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = message.values[key];
    return value && typeof value === "object" ? value[locale] : String(value ?? "");
  });
}
export function cashierError(locale: CashierLocale, message: string) {
  if (!message) return "";
  return locale === "ar" ? message : readEnglish[message] ?? cashierEnglish[message] ?? "Unable to complete this action safely Check your connection and sign-in permissions then try again";
}
export function localizedText(locale: CashierLocale, source: string, translated?: LocalizedText) { return translated?.[locale] || source; }
