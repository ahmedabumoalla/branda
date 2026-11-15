import { hospitalProductName, hospitalCategoryName } from "@/lib/commerce/hospital-labels";
import { financePosCustomerEnglish } from "./pos-customer-labels";
import { financePosShiftLabels } from "./pos-shift-labels";
import { financePosOperationEnglish } from "./pos-operation-labels";
export type FinancePosLanguage = "ar" | "en";
export const FINANCE_POS_LANGUAGE_KEY = "branda.finance.pos.language";
export const financePosEnglish: Record<string, string> = {
  ...financePosCustomerEnglish,
  ...financePosShiftLabels,
  ...financePosOperationEnglish,
  "المخزن الرئيسي": "Main warehouse", "المستودع الرئيسي": "Main warehouse", "صندوق الكاشير الرئيسي": "Main cashier drawer", "حساب الشبكة": "Card account", "المستشفى": "Hospital",
  "إجمالي المرتجع": "Refund total", "المبلغ المعاد للعميل": "Customer refund", "تخفيض الرصيد الآجل": "Credit balance reduction", "المبلغ المتوقع تحصيله": "Expected collection", "صافي المدفوع بعد المرتجع": "Net paid after refund", "المدفوع": "Paid", "ملاحظة": "Note", "معاينة فقط وليست إثبات دفع": "Preview only Not proof of payment", "نسخة تحضير وليست فاتورة تحصيل": "Preparation copy Not a payment invoice", "شكرًا لزيارتكم": "Thank you for visiting",
  "طلب تحضير": "Preparation order", "فاتورة مرتجع": "Refund invoice", "فاتورة مبيعات": "Sales invoice", "مستند مالي": "Financial document", "معاينة فقط لم تُسجل الفاتورة": "Preview only No invoice has been recorded",
  "المرجع المحلي": "Local reference", "محفوظة على الجهاز بانتظار المزامنة": "Saved on this device Awaiting sync", "نسخة المطبخ أو البار": "Kitchen or bar copy",
  "العميل:": "Customer:", "رقم العميل:": "Customer phone:", "رقم العميل الضريبي:": "Customer VAT number:", "طريقة إعادة المبلغ": "Refund method", "طريقة التحصيل": "Payment method", "نقدي": "Cash", "نقاط البيع": "Card",
  "جميع المبالغ بالريال السعودي": "All amounts in Saudi riyals", "مرجع الفاتورة:": "Original invoice:", "الصنف": "Item", "سعر الوحدة": "Unit price", "المجموع قبل الخصم": "Subtotal before discount", "القيمة قبل الضريبة": "Amount before VAT", "ضريبة القيمة المضافة": "Value added tax",
  "الأسعار شاملة الضريبة": "Prices include VAT", "الأسعار غير شاملة الضريبة": "Prices exclude VAT", "صافي الفاتورة": "Invoice total", "المبلغ المدفوع": "Amount paid", "المتبقي": "Outstanding", "المبلغ المرتجع": "Refunded amount", "المبلغ بعد المرتجع": "Amount after refund",
  "لم تُطلب رسالة": "No message requested", "لم تُنشأ رسالة واتساب لهذه الفاتورة": "No WhatsApp message was created for this invoice", "في قائمة الإرسال": "Queued", "الرسالة قيد المعالجة ولم يتأكد إرسالها بعد": "Message is queued Sending has not been confirmed", "جارٍ الإرسال": "Sending", "تجري محاولة إرسال الرسالة": "A send attempt is in progress",
  "بانتظار تأكيد الوصول": "Awaiting delivery", "قبل مزود واتساب طلب الإرسال ولم يتأكد وصولها للعميل": "WhatsApp accepted the message Delivery is not confirmed", "وصلت للعميل": "Delivered", "أكد واتساب وصول الرسالة إلى جهاز العميل": "WhatsApp confirmed delivery to the customer's device", "قرأها العميل": "Read", "أكد واتساب قراءة العميل للرسالة": "WhatsApp confirmed the customer read the message",
  "فشل الإرسال": "Send failed", "لم ينجح إرسال الرسالة": "The message was not sent", "تحتاج مراجعة": "Needs review", "نتيجة الإرسال غير مؤكدة ولا تُعاد الرسالة تلقائيًا": "Send result is uncertain The message will not be retried automatically", "غير مؤكدة": "Unconfirmed", "لا تتوفر حالة مؤكدة للرسالة": "No confirmed message status is available", "أُلغي الإرسال": "Send cancelled", "أُلغيت رسالة هذه الفاتورة": "The invoice message was cancelled",
  "بعد مزامنة الفاتورة": "After invoice sync", "تعذر التحقق": "Unable to check", "جارٍ التحقق": "Checking", "آخر حالة محفوظة تعذر تحديثها": "Last saved status Could not refresh", "لم يُسجل رقم جوال": "No phone number recorded", "خدمة الولاء غير متاحة": "Loyalty unavailable", "لم تُدرج الرسالة للإرسال": "Message was not queued", "رفض مزود واتساب الرسالة": "WhatsApp provider rejected the message", "نتيجة الإرسال غير مؤكدة": "Send result is uncertain", "انتهت مهلة محاولة الإرسال": "Send attempt timed out", "تعذر الإرسال لدى مزود واتساب": "WhatsApp provider could not send", "خدمة واتساب متوقفة": "WhatsApp service stopped", "تعذر التحقق من الحالة": "Could not check status", "أُلغيت الرسالة": "Message cancelled",
  "بانتظار اعتماد السعر": "Awaiting price approval",
  "صنف": "items", "قطعة": "items", "جار حفظ العملية انتظر حتى تكتمل": "Saving the transaction Please wait",
  "لم يكتمل تجهيز الكاشير حدّث المزامنة قبل الدفع": "Cashier is not ready Refresh sync before payment",
  "جار تسجيل الخروج": "Signing out", "أضف منتجًا إلى السلة لبدء الدفع": "Add a product to begin checkout",
  "راجع وحدات الأصناف وأسعارها قبل الدفع أو احذف السلة وأضفها مجددًا": "Check item units and prices before payment or clear and rebuild the cart",
  "يوجد صنف بانتظار اعتماد السعر احذفه من السلة أو اطلب تسعيره من المسؤول": "An item needs price approval Remove it or ask your manager to price it",
  "اعتمد السعر الجديد للأصناف المتغيرة قبل الدفع": "Accept updated item prices before payment",
  "الوردية موقوفة إداريًا تواصل مع المسؤول لاستئناف البيع": "Your shift is paused Contact your manager to resume sales",
  "الوردية بانتظار الاستلام أكمل تسليمها قبل بدء وردية جديدة": "Complete the pending handover before starting a new shift",
  "يجب تسجيل الأرصدة الافتتاحية من إدارة الوردية قبل بدء البيع": "Record opening balances in shift management before selling",
  "اختر الوردية المطلوب استلامها من إدارة الوردية أعلى الصفحة": "Select the incoming shift in shift management above",
  "ابدأ الوردية لإكمال الدفع ستبقى أصناف السلة محفوظة أثناء هذه الخطوة": "Start your shift to continue payment Your cart will be kept",
  "تعذر تسجيل الخروج حاول مرة أخرى": "Could not sign out Try again",
  "هذا المنتج بانتظار اعتماد سعره من إدارة المنتجات ويمكنك إرساله كطلب للمعمل": "This product needs a price approval You can send it as a workshop request",
  "الكمية الإجمالية لهذه الوحدة تتجاوز الحد المسموح": "The total quantity for this unit exceeds the limit",
  "تعذر تجهيز معاينة الإيصال": "Could not prepare the receipt preview",
  "عد النقدية وتأكيد الاستلام": "Count cash and confirm handover", "بدء وردية لإكمال الدفع": "Start shift to continue payment",
  "تغيّر سعر أحد الأصناف اعتمد السعر الجديد في السلة قبل التحصيل": "An item price changed Accept the new cart price before collecting payment",
  "ابدأ وردية مالية قبل تسجيل المبيعات": "Start a shift before recording sales",
  "راجع أصناف السلة والكميات قبل التحصيل": "Check cart items and quantities before collecting payment",
  "اختر مستودع البيع": "Select the sales warehouse", "الخصم يجب ألا يتجاوز قيمة المبيعات": "Discount cannot exceed the sale amount",
  "أضف حساب تحصيل لهذا النوع من المالية ثم حدّث الأرصدة": "Add a payment account for this method and refresh balances",
  "راجع رقم العميل قبل حفظ الفاتورة": "Check the customer phone number before saving",
  "المنتجات وأدوات الكاشير": "Products and cashier tools", "برندة المالية ·": "Branda Finance ·",
  "الكاشير المالي": "Cashier", "الوردية الحالية": "Current shift", "ورديتك موقوفة إداريًا": "Your shift is paused",
  "ورديتك مفتوحة": "Your shift is open", "ورديتك بانتظار الاستلام": "Your shift is awaiting handover",
  "البيع متاح والوردية اختيارية": "Sales enabled Shift is optional", "ابدأ ورديتك": "Start your shift",
  "إدارة الوردية": "Shift management", "صندوق الكاشير": "Cashier drawer", "استلام وبدء وردية": "Accept and start shift",
  "بدء وردية جديدة": "Start new shift", "احفظ السلة أو أفرغها قبل إنهاء الوردية": "Save or clear the cart before ending your shift",
  "عد النقدية وحدد جهة التسليم لإقفال الوردية": "Count cash and select the recipient to close your shift",
  "إنهاء الوردية وتسجيل الخروج": "End shift and sign out", "إنهاء الوردية": "End shift", "خروج": "Sign out",
  "طلب للمعمل": "Workshop request", "الصندوق": "Cash drawer", "بداية الوردية": "Shift started", "نقدية متوقعة": "Expected cash",
  "أدوات الكاشير والوردية": "Cashier and shift tools", "سداد مورد من الصندوق": "Pay supplier from cash drawer", "سداد الموردين": "Supplier payments",
  "سجل المبيعات": "Sales history", "فاتورة مشتريات": "Purchase invoice", "الإدارة المالية": "Finance dashboard",
  "ابحث عن صنف": "Search for an item", "البحث عن صنف": "Search items", "مستودع البيع": "Sales warehouse",
  "فئات الأصناف": "Item categories", "جميع الأصناف": "All items", "قائمة الأصناف القابلة للتمرير": "Scrollable product list",
  "توقف تسجيل العمليات حتى تحديث الأرصدة العملية المحفوظة لا تحتاج إلى تكرار": "Transactions are paused until balances refresh Do not repeat a saved transaction",
  "الأرصدة الافتتاحية لم تسجل بعد": "Opening balances have not been recorded",
  "يُسجل مالك العلامة النقدية الموجودة وأرصدة الشبكة قبل بدء أول وردية": "The owner records opening cash and card balances before the first shift",
  "الأرصدة الافتتاحية": "Opening balances", "تسجيل الأرصدة الافتتاحية": "Record opening balances",
  "منتجات المنيو": "Menu products", "لا توجد أصناف مطابقة": "No matching items", "المنيو خالٍ من الأصناف": "No products yet",
  "جرّب اسمًا آخر أو اختر جميع الأصناف": "Try another name or select all items",
  "أضف منتجات العلامة وصورها وأسعارها من إدارة المنيو": "Add products, photos and prices in menu management",
  "إضافة": "Add", "وتحديد السعر": "and set price", "بسعر": "for", "تحدد السعر وقت البيع": "Set price at checkout",
  "ر س": "SAR", "رصيد المخزون": "Stock balance", "سلة المبيعات": "Sales cart", "طلب جديد": "New order",
  "الأصناف المختارة القابلة للتمرير": "Scrollable selected items", "ابدأ بإضافة صنف": "Start by adding an item",
  "اضغط على صورة الصنف لإضافته إلى السلة": "Tap a product photo to add it to the cart", "للوحدة": "per unit",
  "اعتماد السعر الجديد": "Accept new price", "تقليل كمية": "Decrease quantity of", "كمية": "Quantity of", "زيادة كمية": "Increase quantity of", "حذف": "Remove",
  "ملخص الدفع الثابت": "Payment summary", "الإجمالي المستحق": "Amount due", "بدء الوردية ومتابعة الدفع": "Start shift and continue",
  "الدفع وإصدار الإيصال": "Pay and issue receipt", "إفراغ السلة": "Clear cart", "تحديث ومزامنة الكاشير": "Refresh and sync cashier",
  "وحدة البيع": "Sale unit", "إضافة إلى الطلب": "Add to order", "اختر وحدة البيع": "Select sale unit",
  "هذه الوحدة تحتاج ربط مخزون متوافق": "This unit needs a compatible stock link", "الكمية": "Quantity", "بالـ": "in", "أدخل الكمية": "Enter quantity",
  "يمكن إدخال أجزاء الوحدة حتى ثلاث خانات عشرية": "Fractional quantities support up to three decimal places",
  "أدخل كمية بين ٠٫٠٠١ و٩٩٩٩ بحد أقصى ثلاث خانات عشرية": "Enter a quantity from 0.001 to 9999 with up to three decimal places",
  "سعر": "Price of", "بالريال": "in SAR", "أدخل سعر البيع": "Enter selling price",
  "سعر الوحدة الواحدة وفق إعداد الضريبة المعتمد ويُحفظ في الفاتورة": "Unit price follows the current tax setting and is saved on the invoice",
  "أدخل سعرًا أكبر من صفر بحد أقصى مليون ريال وست خانات عشرية": "Enter a price above zero, up to SAR 1,000,000 and six decimal places",
  "قيمة الصنف": "Item amount", "جار تسجيل العملية": "Recording transaction", "تأكيد الاستلام وإصدار إيصال": "Confirm payment and issue receipt",
  "معاينة الإيصال": "Receipt preview", "تغيّر سعر أحد الأصناف أغلق نافذة الدفع وراجع السعر الجديد في السلة قبل التحصيل": "An item price changed Close checkout and review the new cart price",
  "توقف تسجيل العمليات حتى تحديث الأرصدة": "Transactions paused until balances refresh", "الخصم وتفاصيل المبلغ": "Discount and totals",
  "الخصم": "Discount", "نوع الخصم": "Discount type", "مبلغ بالريال": "Amount in SAR", "نسبة مئوية": "Percentage",
  "قبل الخصم": "Before discount", "الضريبة": "VAT", "ضمن السعر": "included", "الدفع وبيانات العميل": "Payment and customer",
  "طريقة السداد": "Payment method", "كاش": "Cash", "شبكة": "Card", "تحويل بنكي": "Bank transfer", "طرق سداد أخرى": "Other payment methods",
  "ملاحظة الطلب": "Order note", "أكمل الدفع على جهاز الشبكة وتأكد من نجاحه قبل تسجيل البيع هنا": "Complete and confirm card payment on the terminal before recording this sale",
  "تحقق من وصول التحويل البنكي قبل تسجيل البيع": "Confirm the bank transfer before recording this sale", "الوردية": "Shift",
  "تحديث حالة الرسائل": "Refresh message status", "يعرض السجل أحدث العمليات المتاحة": "Showing the latest available transactions",
  "لا توجد مبيعات مسجلة": "No recorded sales", "المستند": "Document", "التاريخ": "Date", "الإجمالي": "Total", "الحالة": "Status",
  "واتساب": "WhatsApp", "الإجراء": "Action", "بانتظار المزامنة": "Awaiting sync", "الإيصال": "Receipt", "مرتجع مبيعات #": "Sales return #", "إرجاع": "Return",
  "إجراءات الكاشير": "Cashier actions", "الخروج من ملء الشاشة": "Exit fullscreen", "ملء الشاشة": "Fullscreen",
  "تعذر تفعيل ملء الشاشة تأكد من دعم المتصفح والسماح بهذه الميزة": "Fullscreen failed Check browser support and permissions",
  "تعذر تغيير وضع الشاشة افتح الصفحة مباشرة في متصفح يدعم ملء الشاشة": "Could not change display mode Open this page in a browser that supports fullscreen",
  "متصل": "Online", "العمل دون اتصال": "Working offline", "— جار المزامنة": "— Syncing", "فاتورة بانتظار المزامنة": "invoices awaiting sync",
  "— توجد فواتير تحتاج مراجعة": "— Some invoices need review", "— عرض تفاصيل المزامنة": "— View sync details", "حالة الحفظ والمزامنة": "Save and sync status",
  "تحديث المزامنة": "Refresh sync", "فواتير محفوظة تحتاج مراجعة": "Saved invoices needing review",
  "الفواتير محفوظة على الجهاز ولا يلزم تحصيل المبلغ من العميل مرة أخرى": "Invoices are saved on this device Do not charge the customer again",
  "إغلاق": "Close", "مدفوع": "Paid", "مستحق": "Outstanding", "محفوظة على الجهاز": "Saved on device", "تحتاج مراجعة المزامنة": "Sync review needed",
  "مرتجع كامل": "Fully refunded", "مرتجع جزئي": "Partially refunded", "كيلو": "kg", "جرام": "g", "حبة": "each", "ذبيحة": "carcass", "نصف ذبيحة": "half carcass", "ربع ذبيحة": "quarter carcass",
  "إدخال الرقم": "Enter number", "لوحة أرقام": "Number keypad", "القيمة الحالية": "Current value", "حذف الرقم السابق": "Backspace", "الفاصلة العشرية": "Decimal point", "تم": "Done", "مسح الكل": "Clear all",
  "أكمل كمية الصنف أو احذفه من السلة قبل الدفع": "Enter the item quantity or remove it before checkout", "كمية وحدة البيع": "Sale unit quantity", "سعر الوحدة بالريال": "Unit price in SAR",
  "تعذر تحميل هوية العلامة تحقق من الاتصال وصلاحية الدخول ثم أعد المحاولة": "Could not load branding Check connection and access, then retry",
  "هوية العلامة غير متاحة حاليًا ستُطبع الفاتورة باسم العلامة دون شعار": "Branding is unavailable The receipt will print with the brand name only",
  "أُرسلت مهمة الطباعة إلى خدمة الطابعة": "Print job sent to the printer service", "فُتحت طباعة إيصال العميل ونسخة المطبخ معًا": "Customer and kitchen receipt print opened",
  "فُتحت نافذة الطباعة": "Print dialog opened", "تأكد من خروج النسخ من الطابعة": "Check that the printer produced the copies",
  "استُخدم خط بديل أو أُخفي شعار غير متاح": "A fallback font was used or an unavailable logo was hidden",
  "تعذر فتح الطباعة حاول مجددًا": "Could not open printing Try again", "فاتورة ضريبية رقم": "Tax invoice number",
  "فتح الفاتورة للطباعة أو التنزيل": "Open invoice to print or download", "قبل مزود الواتساب طلب إرسال الفاتورة": "WhatsApp provider accepted the invoice send request",
  "الفاتورة محفوظة وحالة الإرسال تحتاج مراجعة لن نكررها تلقائيًا": "Invoice saved Send status needs review and will not be retried automatically",
  "تعذر تأكيد حالة الإرسال": "Could not confirm send status", "جار الإرسال": "Sending", "إرسال بالواتساب": "Send via WhatsApp",
  "فاتورة مرتجع #": "Refund invoice #", "طباعة الفاتورة": "Print invoice", "جارٍ تجهيز الطباعة": "Preparing print",
  "طباعة الإيصال والمطبخ": "Print customer and kitchen receipts", "طباعة المعاينة": "Print preview", "طباعة نسخة التحضير": "Print preparation copy", "طباعة إيصال العميل": "Print customer receipt",
  "معاينة قبل تأكيد البيع لا تُسجل فاتورة ولا تُرسل إشعارات": "Preview only No invoice is recorded and no notifications are sent",
  "نسخة الطباعة": "Print copy", "فاتورة العميل": "Customer invoice", "المطبخ أو البار": "Kitchen or bar", "عرض ورق الطباعة": "Paper width",
  "حسب إعداد الطابعة": "Use printer setting", "حراري ٨٠ مم": "80 mm thermal", "حراري ٥٨ مم": "58 mm thermal",
  "تتكيف الفاتورة مع عرض الورق المختار في نافذة الطباعة مع حد أقصى ٨٠ مم": "The receipt fits the selected paper width up to 80 mm",
  "إذا لم يظهر المقاس الصحيح اختر ٥٨ أو ٨٠ مم هنا وفي إعدادات الطابعة وأوقف رؤوس الصفحة وتذييلاتها": "If the size is wrong, select 58 or 80 mm here and in printer settings and disable page headers and footers",
  "جارٍ تحميل هوية العلامة للطباعة": "Loading branding for print", "ستظهر الفاتورة باسم العلامة دون شعار": "The receipt will show the brand name without a logo",
  "تُرسل النسخ بحسب إعداد الطابعة على هذا الجهاز وتبقى إعادة الطباعة متاحة هنا": "Copies use this device's printer settings You can reprint here",
  "يفتح المتصفح نافذة الطباعة ولا يؤكد خروج الورق إذا ألغيتها يمكنك إعادة الطباعة من هنا": "The browser opens printing but cannot confirm paper output If cancelled, reprint here",
  "إعادة تحميل الشعار": "Reload logo",
};

/** Display-only spelling of personal names; never use this value as a persisted identity. */
export function financePosDisplayName(text: string | null | undefined, language: FinancePosLanguage): string {
  if (!text) return "";
  if (language === "ar" || !/[\u0600-\u06ff]/u.test(text)) return text;
  const names: Record<string, string> = { "مايند": "MIND", "المستشفى": "Hospital", "الدكتور": "Dr", "دكتور": "Dr", "الدكتورة": "Dr", "دكتورة": "Dr", "محمد": "Mohammed", "أحمد": "Ahmed", "احمد": "Ahmed", "محمود": "Mahmoud", "عبدالله": "Abdullah", "عبدالرحمن": "Abdulrahman", "عبدالعزيز": "Abdulaziz", "خالد": "Khalid", "علي": "Ali", "عمر": "Omar", "يوسف": "Yousef", "حسن": "Hassan", "حسين": "Hussein", "سعيد": "Saeed", "سعود": "Saud", "فيصل": "Faisal", "فهد": "Fahad", "إبراهيم": "Ibrahim", "ابراهيم": "Ibrahim", "مصطفى": "Mostafa", "سارة": "Sarah", "فاطمة": "Fatima", "مريم": "Maryam", "نورة": "Noura", "نور": "Noor", "عبد": "Abdul", "الله": "Allah", "بن": "bin", "بنت": "bint" };
  const letters: Record<string, string> = { "ا": "a", "أ": "a", "إ": "i", "آ": "aa", "ب": "b", "ت": "t", "ث": "th", "ج": "j", "ح": "h", "خ": "kh", "د": "d", "ذ": "dh", "ر": "r", "ز": "z", "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "dh", "ع": "a", "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "و": "w", "ي": "y", "ى": "a", "ة": "a", "ء": "'", "ئ": "y", "ؤ": "w", "پ": "p", "چ": "ch", "ڤ": "v", "گ": "g", "،": ",", "؛": ";", "؟": "?", "٫": ".", "٬": "," };
  return text.normalize("NFKC").replace(/[\u064b-\u065f\u0670\u0640]/gu, "").replace(/[\u0660-\u0669]/gu, digit => String(digit.charCodeAt(0) - 0x660)).replace(/[\u06f0-\u06f9]/gu, digit => String(digit.charCodeAt(0) - 0x6f0)).replace(/[\u0621-\u064a\u0671-\u06d3]+/gu, word => names[word] ?? Array.from(word).map(letter => letters[letter] ?? letter).join("").replace(/^./, letter => letter.toUpperCase())).replace(/[،؛؟٫٬]/gu, character => letters[character]);
}

export function financePosText(language: FinancePosLanguage, text: string, english?: string): string {
  if (language === "ar") return text;
  if (english !== undefined) return english;
  const normalized = text.trim().replace(/\s+/g, " ");
  const translation = financePosEnglish[normalized];
  if (!translation) {
    const catalog = hospitalCategoryName(hospitalProductName(normalized, language), language);
    if (catalog !== normalized) return catalog;
    const phrases = normalized.split(/(\s+[·•|]\s+)/u);
    if (phrases.length > 1) return phrases.map(phrase => financePosEnglish[phrase.trim()] ?? financePosDisplayName(phrase, language)).join("");
    return text.split(/(\s+)/u).map(part => financePosEnglish[part] ?? financePosDisplayName(part, language)).join("");
  }
  return text.slice(0, text.length - text.trimStart().length) + translation + text.slice(text.trimEnd().length);
}

export function financePosProductName(product: { name: string; nameEn?: string | null }, language: FinancePosLanguage) {
  return language === "en" && product.nameEn?.trim() ? product.nameEn.trim() : financePosDisplayName(hospitalProductName(product.name, language), language);
}
export const financePosCategoryName = (name: string, language: FinancePosLanguage) => financePosDisplayName(hospitalCategoryName(name, language), language);
