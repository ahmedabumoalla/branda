import "server-only";
import { z } from "zod";
import { after } from "next/server";
import { getBrandFinanceContext } from "./brand-finance";
import { createAdminClient } from "@/lib/supabase/admin";
import { readFinanceProviderMessageStatus } from "@/lib/whatsapp/finance-message-status";
import type { FinanceInvoiceMessageStatus } from "@/lib/finance/invoice-message-status";

const inputSchema = z.object({ documentIds: z.array(z.uuid()).max(100) });
const pollSchema = z.object({ id: z.uuid(), pollToken: z.uuid(), phone: z.string().regex(/^9665\d{8}$/), messageId: z.string().min(1).max(300) });

export async function getFinanceInvoiceMessageStatuses(input: { documentIds: string[] }, slug?: string): Promise<{ statuses: FinanceInvoiceMessageStatus[] }> {
  const ids = [...new Set(inputSchema.parse(input).documentIds)];
  const { client, cafe } = await getBrandFinanceContext(slug);
  const read = async () => {
    const { data, error } = await client.rpc("brand_finance_invoice_message_statuses", { p_cafe_id: cafe.id, p_document_ids: ids });
    if (error || !Array.isArray(data)) throw new Error("تعذر تحميل حالات رسائل الفواتير لهذا الحساب");
    return data as FinanceInvoiceMessageStatus[];
  };
  const cached = await read();
  const authorizedIds = cached.map(row => row.documentId);
  if (!authorizedIds.length) return { statuses: cached };
  after(async () => { try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("brand_finance_claim_message_status_checks", { p_cafe_id: cafe.id, p_document_ids: authorizedIds });
    if (error || !Array.isArray(data) || !data.length) return;
    const jobs = data.slice(0, 8).map(row => pollSchema.safeParse(row)).filter(row => row.success).map(row => row.data);
    for (let offset = 0; offset < jobs.length; offset += 4) {
      await Promise.all(jobs.slice(offset, offset + 4).map(async job => {
        const status = await readFinanceProviderMessageStatus(job.phone, job.messageId);
        await admin.rpc("brand_finance_finish_message_status_check", { p_job_id: job.id, p_poll_token: job.pollToken, p_provider_status: status });
      }));
    }
  } catch { /* Provider unavailability never hides saved delivery observations */ } });
  return { statuses: cached };
}
