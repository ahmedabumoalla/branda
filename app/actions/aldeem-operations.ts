'use server';

import { z } from 'zod';
import { actionResult } from '@/lib/platform/action-result';
import { aldeemOperationalRoute } from '@/lib/aldeem/operational-sections';
import { getBrandFinanceContext, readBrandFinanceSnapshot } from '@/lib/data/brand-finance';
import { readInventory } from '@/lib/data/erp-inventory';
import { inventoryKinds, inventoryModules } from '@/lib/erp/inventory';
import { readAccounting } from '@/lib/data/erp-accounting';
import { accountingSections } from '@/lib/erp/accounting';
import { readErpFinance } from '@/lib/data/erp-finance';
import { financeSections, type BankStatementDetail } from '@/lib/erp/finance';
import { readErpBranchFinanceSnapshot } from '@/lib/data/erp-branches';
import { readHr } from '@/lib/data/erp-hr';
import { hrQuerySchema } from '@/lib/erp/hr';
import { readPayroll } from '@/lib/data/erp-payroll';
import { payrollSections } from '@/lib/erp/payroll';
import { readOrganization } from '@/lib/data/erp-organization';
import { organizationKindSchema } from '@/lib/erp/organization';
import { readErpRoles } from '@/lib/data/erp-roles';
import { readAttendance, attendanceQuerySchema } from '@/lib/data/erp-attendance';
import { attendanceModules } from '@/lib/erp/attendance';
import { readSystemSettings } from '@/lib/data/erp-settings';
import { systemSettingsSections, type SystemSettingsSection } from '@/lib/erp/settings';
import { defaultSystemProducts } from '@/lib/erp/settings-products';
import { getFinanceInvoiceSettings } from '@/app/actions/finance-invoice-settings';
import type { OverviewSnapshot } from '@/lib/erp/overview';

const slug = 'khayal-aldeem';
const day = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date(Date.now() + offset * 86400000));

/** Read only the entered domain, including its search and refresh requests. */
export async function readAldeemOperationalPage(href: string) {
  return actionResult(async () => {
    const route = aldeemOperationalRoute(z.string().max(2000).parse(href));
    if (!route) throw new Error('الصفحة غير متاحة');
    const context = await getBrandFinanceContext(slug);
    if (context.cafe.slug !== slug || context.cafe.role !== 'owner') throw new Error('هذه المساحة متاحة لمالك حساب الديم');
    const url = new URL(route, 'https://aldeem.invalid');
    const [domain, ...parts] = url.pathname.slice('/dashboard/system/'.length).split('/').filter(Boolean);
    if (parts.length > 3) throw new Error('مسار الصفحة غير صالح');
    const text = (key: string) => url.searchParams.get(key) || undefined;
    const offset = z.coerce.number().int().min(0).max(1000000).parse(text('offset') ?? 0);
    const today = day();
    const record = (value?: string) => value && value !== 'create' && value !== 'new' && value !== 'import' ? z.uuid().parse(value) : undefined;

    if (domain === 'overview') {
      const from = z.iso.date().parse(text('from') ?? day(-29));
      const to = z.iso.date().parse(text('to') ?? today);
      if (to < from) throw new Error('تاريخ البداية يجب أن يسبق تاريخ النهاية');
      const result = await context.client.rpc('erp_overview_read', { p_cafe: context.cafe.id, p_from: from, p_to: to });
      if (result.error || !result.data) throw new Error('تعذر تحميل النظرة العامة');
      return { kind: 'overview' as const, snapshot: { ...result.data, from, to, slug, brand: context.cafe.name } as OverviewSnapshot };
    }
    if (domain === 'inventory') {
      const section = parts[0] || 'items';
      if (!inventoryModules.some(([id]) => id === section)) throw new Error('قسم المخزون غير متاح');
      // Old menu/stock URLs both open the same retail inventory register.
      const id = record(parts[1]);
      const mode = parts[1] === 'new' ? 'new' : parts[1] === 'import' ? 'import' : parts[2] === 'edit' ? 'edit' : id ? 'detail' : 'list';
      if (section === 'items' && mode === 'detail' && id) return { kind: 'inventory-item-card' as const, itemId: id };
      const selectedKind = text('kind');
      const kind = selectedKind && Object.hasOwn(inventoryKinds, selectedKind) ? selectedKind as keyof typeof inventoryKinds : undefined;
      return { kind: 'inventory' as const, props: { snapshot: await readInventory({ id, prices: section === 'price-lists', catalog: section === 'items' }, slug), module: section as typeof inventoryModules[number][0], mode: mode as 'new' | 'import' | 'edit' | 'detail' | 'list', id, kind } };
    }
    if (domain === 'accounting') {
      const section = parts[0] || 'journals';
      if (!accountingSections.some(([id]) => id === section)) throw new Error('القسم المحاسبي غير متاح');
      const id = record(parts[1]);
      return { kind: 'accounting' as const, props: { initial: await readAccounting(offset, slug, id), section, recordId: parts[1], edit: parts[2] === 'edit', today, initialOffset: offset } };
    }
    if (domain === 'finance') {
      const section = parts[0] || 'expenses';
      if (!financeSections.some(([id]) => id === section)) throw new Error('القسم المالي غير متاح');
      const id = record(parts[1]);
      const initial = await readErpFinance({ offset, id, kind: section === 'expenses' ? 'expense' : section === 'receipts' ? 'receipt' : undefined }, slug);
      let bankDetail: BankStatementDetail | undefined;
      if (section === 'bank-statements' && id) {
        const result = await context.client.rpc('erp_finance_detail', { p_cafe_id: context.cafe.id, p_kind: 'bank', p_id: id });
        if (result.error) throw new Error('تعذر تحميل كشف البنك');
        bankDetail = result.data as BankStatementDetail;
      }
      return { kind: 'finance' as const, props: { initial, section, recordId: parts[1], edit: parts[2] === 'edit', today, initialOffset: offset, bankDetail }, treasury: section === 'treasury' ? await readErpBranchFinanceSnapshot(slug) : null };
    }
    if (domain === 'employees') {
      const id = parts[0] && !['create', 'settings', 'documents'].includes(parts[0]) ? record(parts[0]) : undefined;
      const query = hrQuerySchema.parse({ id: id ?? null, page: text('page'), query: text('query'), status: text('status'), kind: text('kind'), branchId: text('branchId') ?? null, departmentId: text('departmentId') ?? null });
      const data = await readHr(query, slug);
      return { kind: 'employees' as const, props: { initial: data.snapshot, slug, parts, query, today } };
    }
    if (domain === 'roles') {
      if (parts[0] && parts[0] !== 'new') record(parts[0]);
      return { kind: 'roles' as const, props: { snapshot: await readErpRoles(slug), segments: parts, copyId: text('copy') } };
    }
    if (domain === 'payroll') {
      const section = parts[0] || 'contracts';
      if (!payrollSections.some(([id]) => id === section)) throw new Error('قسم الرواتب غير متاح');
      record(parts[1]);
      return { kind: 'payroll' as const, props: { initial: await readPayroll(slug), section, recordId: parts[1], edit: parts[2] === 'edit', today } };
    }
    if (domain === 'organization') {
      const section = parts[0] || 'department';
      if (section !== 'chart') organizationKindSchema.parse(section);
      record(parts[1]);
      const data = await readOrganization(slug);
      return { kind: 'organization' as const, props: { initial: data.snapshot, slug, segments: parts.length ? parts : ['department'] } };
    }
    if (domain === 'attendance') {
      const section = z.enum(attendanceModules).parse(parts[0] || 'schedule');
      const mode = parts[1] === 'new' ? 'create' : parts[1] === 'calculate' ? 'calculate' : parts[1] === 'import' ? 'import' : parts[2] === 'edit' ? 'edit' : parts[1] ? 'detail' : section === 'settings' ? 'settings' : 'list';
      const id = ['detail', 'edit'].includes(mode) ? record(parts[1]) : undefined;
      const query = attendanceQuerySchema.parse({ id, employeeId: text('employeeId'), from: text('from'), to: text('to'), q: text('q'), status: text('status'), page: Number(text('page') ?? 1) });
      return { kind: 'attendance' as const, props: { snapshot: await readAttendance(section, query, slug), mode, query } };
    }
    if (domain === 'settings') {
      const section = parts[0] || 'general';
      if (!Object.hasOwn(systemSettingsSections, section)) throw new Error('الإعداد غير متاح');
      const [initial, finance, products] = await Promise.all([
        readSystemSettings(slug),
        ['payments', 'taxes', 'numbering', 'general'].includes(section) ? (async () => {
          const [state, snapshot] = await Promise.all([getFinanceInvoiceSettings(slug), ['payments', 'taxes'].includes(section) ? readBrandFinanceSnapshot(context, { signMenuImages: false }) : Promise.resolve(null)]);
          if (!state.ok) throw new Error(state.message);
          return { state: state.data, accounts: snapshot?.accounts ?? null, settings: snapshot?.settings ?? null };
        })() : Promise.resolve(null),
        section === 'taxes' ? (async () => { const r = await context.client.rpc('erp_system_product_configuration', { p_cafe: context.cafe.id }); if (r.error) throw new Error('تعذر تحميل ضرائب المنتجات'); return r.data; })() : Promise.resolve(defaultSystemProducts),
      ]);
      if (section === 'numbering') { const r = await context.client.rpc('erp_system_numbering', { p_cafe: context.cafe.id }); if (r.error) throw new Error('تعذر تحميل الترقيم'); initial.numbering = r.data; }
      return { kind: 'settings' as const, props: { initial, section: section as SystemSettingsSection, finance, products } };
    }
    throw new Error('الصفحة غير متاحة');
  }, 'تعذر تحميل بيانات القسم حاول مجددًا');
}

export type AldeemOperationalPage = Extract<Awaited<ReturnType<typeof readAldeemOperationalPage>>, { ok: true }>['data'];
