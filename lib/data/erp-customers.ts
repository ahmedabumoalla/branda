import {branchFinanceSnapshot} from '@/lib/data/erp-branches';
import "server-only";
import {getBrandFinanceContext} from "@/lib/data/brand-finance";
import {defaultCustomerSettings,type CustomerSnapshot} from "@/lib/erp/customers";
export function customerErpError(error:{code?:string;message?:string}|null){if(!error)return;if(error.code==='23505')throw new Error('الكود أو الاسم أو الباركود مستخدم بالفعل');if(error.code==='23503')throw new Error('السجل مرتبط ببيانات أخرى ولا يمكن حذفه');if(error.code==='40001')throw new Error('تغيرت البيانات أعد تحميل الصفحة');if(error.message&&/[\u0600-\u06ff]/.test(error.message)&&error.message.length<350)throw new Error(error.message);throw new Error('تعذر تأكيد بيانات العملاء');}
export async function readErpCustomers(slug?: string): Promise<CustomerSnapshot> {
  const context = await getBrandFinanceContext(slug);
  const records = context.client.rpc(context.cafe.slug === "mind-hospital" ? "erp_mind_customers_read" : "erp_customers_read", { p_cafe_id: context.cafe.id }).then(async result => {
    customerErpError(result.error);
    const customers = result.data.customers as CustomerSnapshot["customers"];
    const paths = customers.map(customer => customer.photoPath).filter((path): path is string => typeof path === "string" && path.startsWith(context.cafe.id + "/"));
    const signed = paths.length ? await context.client.storage.from("erp-record-files").createSignedUrls(paths, 60) : null;
    const urls = new Map((signed?.data ?? []).filter(image => image.signedUrl).map(image => [image.path, image.signedUrl]));
    if (paths.length) customers.forEach(customer => { customer.photoUrl = customer.photoPath ? urls.get(customer.photoPath) ?? undefined : undefined; });
    return { ...result.data, customers };
  });
  const [data, finance] = await Promise.all([records, branchFinanceSnapshot(context)]);
  const customerIds = new Set((data.customers as CustomerSnapshot["customers"]).map(customer => customer.id));
  return {
    ...data, settings: { ...defaultCustomerSettings, ...data.settings }, slug: context.cafe.slug, brand: context.cafe.name,
    finance: {
      cafe: finance.cafe, role: finance.role, userId: finance.userId, canAdminister: finance.canAdminister,
      accounts: finance.accounts.filter(account => account.active && !account.is_cashier_drawer && ["cash", "bank", "pos"].includes(account.kind)),
      documents: finance.documents.filter(document => document.party_id && customerIds.has(document.party_id) && ["sale", "refund", "settlement"].includes(document.kind)),
    },
  };
}
