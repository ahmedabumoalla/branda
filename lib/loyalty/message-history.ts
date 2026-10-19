import { z } from "zod";

export const messageHistoryInputSchema = z.object({
  brandId: z.uuid().optional(),
  page: z.number().int().min(0).max(100000).default(0),
}).strict();
export type MessageHistoryInput = z.input<typeof messageHistoryInputSchema>;
export const messageHistoryPageSize = 10;
export const walletMessageSchema = z.object({
  id: z.uuid(), title: z.string(), body: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  status: z.enum(["pending", "processing", "sent", "failed"]),
  apple: z.enum(["accepted", "failed", "pending", "skipped", "unknown"]),
  google: z.enum(["accepted", "failed", "pending", "skipped", "unknown"]),
});
export const messageHistoryPageSchema = z.object({
  messages: z.array(walletMessageSchema), total: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
});
export type WalletMessage = z.infer<typeof walletMessageSchema>;
export type MessageHistoryPage = z.infer<typeof messageHistoryPageSchema>;

export function walletProviderStatus(value: unknown): WalletMessage["apple"] {
  if (!value || typeof value !== "object") return "unknown";
  const state = value as { status?: unknown; pending?: unknown };
  if (state.status === "accepted") return "accepted";
  if (state.pending === true) return "pending";
  return state.status === "failed" || state.status === "skipped" ? state.status : "unknown";
}

export function walletMessageStatus(message: WalletMessage) {
  const accepted = message.apple === "accepted" || message.google === "accepted";
  if (message.status === "processing") return "جارٍ الإرسال";
  if (message.status === "pending") return accepted ? "قُبل جزئيًا وتنتظر البقية" : "بانتظار الإرسال أو إعادة المحاولة";
  if (message.status === "failed") return accepted ? "قُبل جزئيًا وتعذرت البقية" : "تعذر الإرسال";
  if (accepted) return "قُبل طلب الإرسال";
  if (message.apple === "skipped" && message.google === "skipped") return "محفوظة دون إرسال";
  return "انتهت المعالجة دون تأكيد قبول";
}
