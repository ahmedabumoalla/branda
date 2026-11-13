import { z } from "zod";

const uuidOrEmpty = z.union([z.uuid(), z.literal("")]);
const amount = z.number().finite().min(0).max(1_000_000_000);
const taxRate = z.union([z.literal(0), z.literal(15)]);
export const invoiceCurrencySchema = z.enum(["SAR", "USD", "EUR", "GBP", "AED"]);
const numbering = z.object({ prefix: z.string().max(12).regex(/^[A-Za-z0-9\u0600-\u06ff_-]*$/), next: z.number().int().min(1).max(999999999999), padding: z.number().int().min(1).max(12), manual: z.boolean() }).strict();
export const advancedInvoiceSettingsSchema = z.object({
  numbering, debitNumbering: numbering,
  billingMethod: z.enum(["print", "email", "both"]),
  customStatusesEnabled: z.boolean(), statuses: z.array(z.object({ id: z.uuid(), name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).strict()).max(30),
  profitEnabled: z.boolean(), showExchangeRate: z.boolean(),
  currencies: z.array(z.object({ code: invoiceCurrencySchema, rate: z.number().finite().positive().max(1000000) }).strict()).min(1).max(5),
  socialEnabled: z.boolean(), socialPlatforms: z.array(z.enum(["whatsapp", "email", "native"])).max(3),
  discountCapsEnabled: z.boolean(), discountCaps: z.array(z.object({ userId: z.uuid(), percent: z.number().min(0).max(100) }).strict()).max(200),
  advancedPricing: z.boolean(), minimumIncludesTax: z.boolean(),
  productPolicies: z.array(z.object({ productId: z.uuid(), kind: z.enum(["product", "service"]), minimumPrice: amount, vatRate: taxRate, taxCategory: z.enum(["S", "Z", "E", "O"]), exemptionReason: z.string().max(250) }).strict()).max(500),
  priceListsEnabled: z.boolean(), priceLists: z.array(z.object({ id: z.uuid(), name: z.string().trim().min(1).max(80), active: z.boolean(), prices: z.array(z.object({ productId: z.uuid(), catalogSource: z.enum(["menu", "inventory"]).optional(), price: amount }).strict()).max(500), partyIds: z.array(z.uuid()).max(500) }).strict()).max(30),
  adjustmentsEnabled: z.boolean(), adjustments: z.array(z.object({ id: z.uuid(), name: z.string().trim().min(1).max(80), accountId: z.uuid(), kind: z.enum(["addition", "deduction"]), taxable: z.boolean() }).strict()).max(30),
  defaultPaymentKind: z.enum(["cash", "bank", "pos", "credit"]), defaultAccountId: uuidOrEmpty,
  autoApplyCredit: z.boolean(), debitNotesEnabled: z.boolean(),
  excludedCategories: z.array(z.string().trim().min(1).max(120)).max(100), activityKind: z.enum(["products", "services", "both"]),
  journalTemplateEnabled: z.boolean(), journalTemplate: z.string().max(500),
  taxMode: z.enum(["product", "none", "specific"]), specificTaxRate: taxRate, taxRequired: z.boolean(), exemptionReason: z.string().max(250),
}).strict();
export type AdvancedInvoiceSettings = z.infer<typeof advancedInvoiceSettingsSchema>;
export const defaultAdvancedInvoiceSettings: AdvancedInvoiceSettings = {
  numbering: { prefix: "", next: 1, padding: 6, manual: false }, debitNumbering: { prefix: "DN-", next: 1, padding: 6, manual: false },
  billingMethod: "print", customStatusesEnabled: false, statuses: [], profitEnabled: false, showExchangeRate: false,
  currencies: [{ code: "SAR", rate: 1 }], socialEnabled: false, socialPlatforms: [], discountCapsEnabled: false, discountCaps: [],
  advancedPricing: false, minimumIncludesTax: true, productPolicies: [], priceListsEnabled: false, priceLists: [], adjustmentsEnabled: false, adjustments: [],
  defaultPaymentKind: "cash", defaultAccountId: "", autoApplyCredit: false, debitNotesEnabled: false, excludedCategories: [], activityKind: "both",
  journalTemplateEnabled: false, journalTemplate: "", taxMode: "specific", specificTaxRate: 15, taxRequired: true, exemptionReason: "",
};

/** Management invoice preferences; fiscal posting remains authoritative in PostgreSQL. */
export const invoiceSettingsSchema = z.object({
  allowLineEditing: z.boolean(),
  previewBeforeSave: z.boolean(),
  priceHints: z.enum(["hidden", "last"]),
  copyNotesOnConversion: z.boolean(),
  decimalDisplay: z.enum(["always", "never", "auto"]),
  allowDeposits: z.boolean(),
  discountMode: z.enum(["both", "invoice", "line"]),
  allowBelowCost: z.boolean(),
  defaultPaid: z.boolean(),
  advanced: advancedInvoiceSettingsSchema.default(defaultAdvancedInvoiceSettings),
}).strict();
export type InvoiceSettings = z.infer<typeof invoiceSettingsSchema>;
export const defaultInvoiceSettings: Readonly<InvoiceSettings> = Object.freeze({
  allowLineEditing: true, previewBeforeSave: true, priceHints: "last", copyNotesOnConversion: true,
  decimalDisplay: "always", allowDeposits: true, discountMode: "both", allowBelowCost: true, defaultPaid: true,
  advanced: defaultAdvancedInvoiceSettings,
});
export const invoiceSettingsStateSchema = z.object({
  settings: invoiceSettingsSchema,
  revision: z.number().int().nonnegative(),
  nextNumber: z.number().int().positive().nullable(),
}).strict();
export type InvoiceSettingsState = z.infer<typeof invoiceSettingsStateSchema>;

/** Only suppress insignificant trailing zeros; never round away monetary fractions. */
export function invoiceSettingsMoney(value: number, mode: InvoiceSettings["decimalDisplay"] = "always", currency = "SAR") {
  const minimumFractionDigits = mode === "always" || (mode === "auto" && Math.abs(value) < 1000) ? 2 : 0;
  return new Intl.NumberFormat("ar-SA", { style: "currency", currency, minimumFractionDigits, maximumFractionDigits: 2 }).format(value).replace("ر.س.", "ر.س");
}

export const invoiceEditorContextSchema = z.object({
  creditBalance: z.number().finite().nonnegative(), maxDiscountPercent: z.number().min(0).max(100),
  products: z.array(z.object({ productId: z.uuid(), minimumPrice: amount, averageCost: z.number().finite().nullable(), costKnown: z.boolean(), lastPrice: z.number().finite().nullable(), kind: z.enum(["product", "service"]), vatRate: taxRate, taxCategory: z.enum(["S", "Z", "E", "O"]), exemptionReason: z.string() })),
});
export type InvoiceEditorContext = z.infer<typeof invoiceEditorContextSchema>;
