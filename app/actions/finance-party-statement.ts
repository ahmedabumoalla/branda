'use server';

import { z } from 'zod';
import { actionResult } from '@/lib/platform/action-result';
import { getBrandFinanceContext } from '@/lib/data/brand-finance';
import { branchError } from '@/lib/data/erp-branches';
import { getFinanceReceiptBrandForCafe } from '@/lib/data/finance-receipt-brand';
import { defaultDocumentTemplate } from '@/lib/erp/templates';
import { renderDocumentTemplate, templateEscape } from '@/lib/erp/templates-render';
import { selectStatement, statementHead, statementTable, statementMoney, type PartyStatement } from '@/lib/finance/party-statement';

async function read(slug: string, partyId: string) {
  const id = z.guid().parse(partyId);
  const { client, cafe } = await getBrandFinanceContext(slug);
  const result = await client.rpc('finance_party_account_statement', { p_cafe: cafe.id, p_party: id });
  branchError(result.error);
  return { data: result.data as PartyStatement, cafe };
}
export async function fetchPartyStatement(slug: string, partyId: string) {
  return actionResult(async () => (await read(slug, partyId)).data, 'تعذر تحميل كشف الحساب');
}
export async function printPartyStatement(slug: string, partyId: string, from: string, to: string) {
  return actionResult(async () => {
    z.object({ from: z.union([z.iso.date(), z.literal('')]), to: z.union([z.iso.date(), z.literal('')]) })
      .refine(value => !value.from || !value.to || value.from <= value.to).parse({ from, to });
    // Reauthorize and read the ledger at export time; never trust client-provided amounts.
    const { data, cafe } = await read(slug, partyId);
    const brand = await getFinanceReceiptBrandForCafe(cafe);
    const selection = selectStatement(data, from, to);
    const title = data.party.kind === 'supplier' ? 'كشف حساب المورد' : 'كشف حساب العميل';
    const template = defaultDocumentTemplate('party_statement', title);
    template.layout = { ...template.layout, title, orientation: 'landscape', margin: 12, fontSize: 10, accent: '#e9ddcf',
      body: `${brand.logoUrl ? `<img src="${templateEscape(brand.logoUrl)}" alt="${templateEscape(brand.name)}" width="100"/>` : ''}<h2>{{العلامة}}</h2><h3>{{العميل}}</h3><p>{{الفترة}} — {{الفرع}}</p><p>{{الملخص}}</p>`,
      footer: '{{الخاتمة}}',
    };
    return { html: renderDocumentTemplate(template, {
      العلامة: brand.name, العميل: data.party.name,
      الفترة: from || to ? `من ${from || 'بداية التعامل'} إلى ${to || 'اليوم'}` : 'كامل فترة التعامل',
      الفرع: data.branch.name || 'جميع الفروع',
      الملخص: `الفواتير ${statementMoney(selection.invoiced)} | المسدد الصافي ${statementMoney(selection.paid)} | المتبقي الآجل ${statementMoney(selection.outstanding)} | المرتجع ${statementMoney(selection.refunded)} ر س`,
      الخاتمة: `إجمالي المدين ${statementMoney(selection.debit)} | إجمالي الدائن ${statementMoney(selection.credit)}\nالرصيد الختامي ${statementMoney(selection.balance)} ر س\nالمدين والدائن من القيود المحاسبية والمبالغ المسددة والمتبقية تعكس حالة الفواتير وقت إصدار الكشف`,
    }, { head: statementHead, rows: [
      ['', '', 'الرصيد السابق', '', '', '', '', '', statementMoney(selection.opening)],
      ...statementTable(selection.rows), ['', '', 'الرصيد الختامي', '', '', '', statementMoney(selection.debit), statementMoney(selection.credit), statementMoney(selection.balance)],
    ] }) };
  }, 'تعذر تجهيز كشف الحساب للطباعة');
}
