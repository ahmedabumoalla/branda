export type BankTransferDetails = { beneficiary: string; bankName: string; iban: string; accountNumber: string };
export type CurrentSubscription = { id: string; planId: string; status: string; startedAt: string | null; expiresAt: string | null };
export type BankSubscriptionRequest = {
  id: string; planId: string; planName: string; amount: number; durationMonths: number;
  status: string; receiptChannel: "upload" | "whatsapp"; receiptStoragePath?: string;
  createdAt: string; adminResponse?: string;
};

export function subscriptionWhatsappUrl(customerName: string, planName: string, requestId?: string) {
  const message = `مرحبًا أرغب بالاشتراك في باقة ${planName} اسم العميل: ${customerName}${requestId ? ` رقم الطلب: ${requestId} سأرفق إيصال التحويل هنا للمراجعة` : " أرجو إرسال بيانات التحويل البنكي باسم العنوان الحصري"}`;
  return `https://wa.me/966508424401?text=${encodeURIComponent(message)}`;
}
