import { cashierEnglish } from "./messages";

export type CashierLocale = "ar" | "en";
export type LocalizedText = { ar: string; en: string };
export type CashierMessage = string | { text: string; values: Record<string, string | number | LocalizedText> };
export const cashierLanguageCookie = "branda-cashier-language";
const readEnglish: Record<string, string> = {
  "ملخص العميل": "Customer summary",
  "الرصيد الحالي": "Current balance",
  "الختم قيد التسجيل": "Stamp pending",
  "بلغ العميل الحد اليومي المسموح وهو ختمان يمكن إضافة ختم جديد غدًا": "The customer has reached the daily limit of two stamps A new stamp can be added tomorrow",
  "جارٍ عرض بيانات العميل": "Loading customer details",
  "تأخر عرض الرصيد يمكنك متابعة تسجيل الختم": "Balance is taking longer You can still record the stamp",
  "تعذر عرض الرصيد الآن يمكنك متابعة تسجيل الختم": "Balance unavailable You can still record the stamp",
  "تحقق من جلسة الكاشير لعرض الرصيد": "Check your cashier session to view the balance",
  "لم تُوجد بطاقة متاحة لهذا الرقم": "No available card found for this number",
  "آخر رصيد مؤكد يتحدث بعد اكتمال التسجيل": "Last confirmed balance Updates when the stamp completes",
  "لم يتأكد تسجيل الختم راجع عدادات المزامنة": "Stamp not confirmed Check the sync counters",
  "رقم البطاقة أو رقم الجوال": "Card number or phone number",
  "امسح البطاقة أو أدخل رقم البطاقة أو الجوال": "Scan a card or enter the card or phone number",
  "تسجيل الختم": "Record stamp",
  "جاري حفظ القراءة": "Saving scan",
  "تمت قراءة الرمز اضغط تسجيل الختم": "Code scanned Press Record stamp",
  "هذه القراءة محفوظة مسبقًا وتنتظر المزامنة": "This scan is already saved and awaiting sync",
  "تم حفظ القراءة على هذا الجهاز يمكنك خدمة العميل التالي وتابع عدادات المزامنة": "Scan saved on this device You can serve the next customer and follow the sync counters",
  "تعذر حفظ القراءة على الجهاز لم تُرسل العملية احتفظ بالرقم وحاول مجددًا": "Could not save this scan Nothing was sent Keep the number and try again",
  "أدخل البطاقة أو رقم الجوال ثم اضغط تسجيل الختم تُحفظ القراءة فورًا ويبحث النظام عن العميل ويسجل الختم في الخلفية": "Enter a card or phone number and press Record stamp The scan is saved immediately while the customer is found and stamped in the background",
  "رقم الجوال ينشئ بطاقة تلقائيًا للعميل الجديد ويسجل أول ختم": "A phone number automatically creates a card and records the first stamp for a new customer",
  "ثبّت المؤشر داخل الحقل ثم امسح بالقارئ زر الإدخال يحفظ طلب تسجيل ختم واحد": "Focus the input and scan Pressing Enter saves one stamp request",
  "الحفظ على الجهاز لا يعني اكتمال الختم تابع عدادات المزامنة ولا تمسح بيانات المتصفح قبل اكتمالها": "Saved on device does not mean stamped Follow the sync counters and do not clear browser data before syncing completes",
  "ملخص قراءات هذا الجهاز": "Scan summary on this device",
  "حالة المزامنة": "Sync status",
  "أختام مسجلة": "Stamps recorded",
  "أختام أكد النظام تسجيلها بنجاح": "Stamps confirmed successfully by the system",
  "تحتاج مزامنة": "Needs sync",
  "قراءات محفوظة أو قيد المعالجة أو قابلة لإعادة المزامنة": "Saved scans, processing scans or scans eligible for retry",
  "لم تُسجل": "Not recorded",
  "لم يُضف ختم وتشمل العمليات المرفوضة والمكررة والتي تحتاج مراجعة": "No stamp added Includes rejected, duplicate and review-required operations",
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
