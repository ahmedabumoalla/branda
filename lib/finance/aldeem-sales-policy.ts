import { z } from "zod";
// Account policy shared by the Aldeem settings screen and invoice editor.
export const policySchema = z.object({
  autoNumber: z.boolean(), firstNumber: z.number().int().min(1).max(999999999),
  editNumber: z.boolean(), editDate: z.boolean(), lastPrice: z.boolean(),
  showCost: z.boolean(), minimumPrice: z.boolean(), discounts: z.boolean(),
  print: z.boolean(), whatsapp: z.boolean(), preview: z.boolean(), credit: z.boolean(),
  decimals: z.number().int().min(0).max(6), belowCost: z.boolean(), outOfStock: z.boolean(),
  cash: z.boolean(), network: z.boolean(), visa: z.boolean(), transfer: z.boolean(),
  taxEnabled: z.boolean(), taxName: z.string().trim().min(1).max(80), taxRate: z.number().min(0).max(100),
}).strict().refine(value => value.print || value.whatsapp, "اختر طريقة واحدة على الأقل لإصدار الفاتورة")
  .refine(value => value.cash || value.network || value.visa || value.transfer, "اختر طريقة دفع واحدة على الأقل");
export type Policy = z.infer<typeof policySchema>;
export type AldeemSalesPolicyState = { policy: Policy; revision: number };
export const defaults: Policy = {
  autoNumber: true, firstNumber: 1, editNumber: false, editDate: false,
  lastPrice: false, showCost: false, minimumPrice: false, discounts: true,
  print: true, whatsapp: false, preview: true, credit: false, decimals: 2,
  belowCost: false, outOfStock: false, cash: true, network: true, visa: false, transfer: true,
  taxEnabled: true, taxName: "ضريبة القيمة المضافة", taxRate: 15,
};
