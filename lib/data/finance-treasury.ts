import "server-only";
import { z } from "zod";
import { getBrandFinanceContext } from "./brand-finance";
import { getCurrentMaintenanceSession } from "@/lib/platform/maintenance";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TreasuryFeeHistory, TreasuryHistory, TreasuryResult, TreasurySnapshot, TreasuryStatement, TreasuryStatementOptions } from "@/lib/finance/treasury";

const operations = z.enum(["account_save", "account_archive", "account_primary", "opening", "voucher", "transfer", "pos_settle", "pos_fee_pay", "reconcile"]);
const corrections = z.enum(["reverse", "reset", "reconcile_adjust"]);
const payloadSchema = z.record(z.string(), z.unknown());
const dateSchema = z.iso.date().optional();
const statementOptions = z.object({ offset: z.number().int().min(0).max(10_000_000).default(0), from: dateSchema, to: dateSchema });

function invalidInput() { return new Error("راجع بيانات الخزينة وأكمل الحقول المطلوبة"); }
function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw invalidInput();
  return result.data;
}
function safeDatabaseError(error: { code?: string; message?: string }): never {
  if (error.code === "42501") throw new Error("لا تملك صلاحية تنفيذ هذه العملية");
  if (error.message && /[\u0600-\u06ff]/.test(error.message) && error.message.length < 300) throw new Error(error.message);
  throw new Error("تعذر تأكيد العملية راجع البيانات والأرصدة ثم أعد المحاولة بنفس الطلب");
}
async function treasuryContext(slug?: string) {
  const context = await getBrandFinanceContext(slug);
  if (context.cafe.role === "cashier") throw new Error("إدارة الخزينة متاحة لمالك العلامة والمدير المالي");
  return context;
}
async function maintenanceContext(cafeId: string) {
  const session = await getCurrentMaintenanceSession();
  if (!session || session.cafeId !== cafeId) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.from("profiles").select("role,status").eq("id", session.adminUserId).maybeSingle();
  if (error || data?.role !== "platform_admin" || data.status !== "active") return null;
  return { admin, session };
}

export async function getFinanceTreasury(slug?: string): Promise<TreasurySnapshot> {
  const { client, cafe } = await treasuryContext(slug);
  const { data, error } = await client.rpc("brand_finance_treasury_snapshot", { p_cafe_id: cafe.id });
  if (error) safeDatabaseError(error);
  return { ...(data as TreasurySnapshot), canCorrect: !!await maintenanceContext(cafe.id) };
}

export async function getFinanceAccountStatement(accountId: unknown, options: TreasuryStatementOptions = {}, slug?: string): Promise<TreasuryStatement> {
  const id = validate(z.uuid(), accountId);
  const parsed = validate(statementOptions, { ...options, from: options.from || undefined, to: options.to || undefined });
  if (parsed.from && parsed.to && parsed.from > parsed.to) throw new Error("تاريخ البداية يجب أن يسبق تاريخ النهاية");
  const { client, cafe } = await treasuryContext(slug);
  const { data, error } = await client.rpc("brand_finance_treasury_statement", {
    p_cafe_id: cafe.id, p_account_id: id, p_offset: parsed.offset, p_limit: 100,
    p_from: parsed.from ?? null, p_to: parsed.to ?? null,
  });
  if (error) safeDatabaseError(error);
  return data as TreasuryStatement;
}

export async function executeFinanceTreasury(operation: unknown, payload: unknown, requestId: unknown, slug?: string): Promise<TreasuryResult> {
  const command = validate(operations, operation);
  const values = validate(payloadSchema, payload);
  const request = validate(z.uuid(), requestId);
  if (JSON.stringify(values).length > 30_000) throw invalidInput();
  const { client, cafe } = await treasuryContext(slug);
  const { data, error } = await client.rpc("brand_finance_treasury_execute", {
    p_cafe_id: cafe.id, p_operation: command, p_payload: values, p_request_id: request,
  });
  if (error) safeDatabaseError(error);
  return data as TreasuryResult;
}

export async function getFinanceTreasuryHistory(accountId: unknown, kind: unknown, offset: unknown = 0, slug?: string): Promise<TreasuryHistory> {
  const id = validate(z.uuid(), accountId);
  const category = validate(z.enum(["audit", "reconciliations"]), kind);
  const page = validate(z.number().int().min(0).max(10_000_000), offset);
  const { client, cafe } = await treasuryContext(slug);
  const { data, error } = await client.rpc("brand_finance_treasury_history", { p_cafe_id: cafe.id, p_account_id: id, p_kind: category, p_offset: page });
  if (error) safeDatabaseError(error);
  return data as TreasuryHistory;
}

export async function getFinanceTerminalFeeHistory(accountId: unknown = null, offset: unknown = 0, slug?: string): Promise<TreasuryFeeHistory> {
  const id = validate(z.uuid().nullable(), accountId);
  const page = validate(z.number().int().min(0).max(10_000_000), offset);
  const { client, cafe } = await treasuryContext(slug);
  const { data, error } = await client.rpc("brand_finance_terminal_fee_history", { p_cafe_id: cafe.id, p_account_id: id, p_offset: page });
  if (error) safeDatabaseError(error);
  return data as TreasuryFeeHistory;
}

export async function executeFinanceTreasuryCorrection(operation: unknown, payload: unknown, requestId: unknown, slug?: string): Promise<TreasuryResult> {
  const command = validate(corrections, operation);
  const values = validate(payloadSchema, payload);
  const request = validate(z.uuid(), requestId);
  if (JSON.stringify(values).length > 10_000) throw invalidInput();
  const reason = validate(z.string().trim().min(3).max(1000), values.reason);
  const { cafe } = await treasuryContext(slug);
  const context = await maintenanceContext(cafe.id);
  if (!context) throw new Error("التصحيح وتصفير الأرصدة متاحان لأدمن برندة من الدخول بالنيابة فقط");
  // Actor and maintenance expiry are obtained from the signed server cookie, never the request payload.
  const { data, error } = await context.admin.rpc("brand_finance_treasury_correct", {
    p_cafe_id: cafe.id, p_actor_id: context.session.adminUserId,
    p_maintenance_expires_at: new Date(context.session.expiresAt).toISOString(),
    p_operation: command, p_payload: { ...values, reason }, p_request_id: request,
  });
  if (error) safeDatabaseError(error);
  return data as TreasuryResult;
}
