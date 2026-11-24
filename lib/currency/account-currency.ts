import type { BrandPhoneCountry } from "@/lib/auth/brand-phone";

// ISO 4217 codes/minor units: SIX List One, verified 2026-11-24.
// https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
// Palestine: ILS is the default for everyday retail, not a national currency.
// https://www.pma.ps/Portals/0/Users/002/02/2/Publications/English/Quarterly%20Reports/Inflation%20Reports/%20%282023%29%20Inflation%20Report%20%28Q-4%29.pdf
// Denomination only: never convert stored prices or financial balances.
export const ARAB_ACCOUNT_CURRENCIES = {
  SA: { currencyCode: "SAR", currencyLabel: "ر.س", currencyName: "ريال سعودي", fractionDigits: 2 },
  AE: { currencyCode: "AED", currencyLabel: "د.إ", currencyName: "درهم إماراتي", fractionDigits: 2 },
  BH: { currencyCode: "BHD", currencyLabel: "د.ب", currencyName: "دينار بحريني", fractionDigits: 3 },
  KW: { currencyCode: "KWD", currencyLabel: "د.ك", currencyName: "دينار كويتي", fractionDigits: 3 },
  OM: { currencyCode: "OMR", currencyLabel: "ر.ع", currencyName: "ريال عماني", fractionDigits: 3 },
  QA: { currencyCode: "QAR", currencyLabel: "ر.ق", currencyName: "ريال قطري", fractionDigits: 2 },
  YE: { currencyCode: "YER", currencyLabel: "ر.ي", currencyName: "ريال يمني", fractionDigits: 2 },
  JO: { currencyCode: "JOD", currencyLabel: "د.أ", currencyName: "دينار أردني", fractionDigits: 3 },
  PS: { currencyCode: "ILS", currencyLabel: "شيكل", currencyName: "شيكل", fractionDigits: 2 },
  LB: { currencyCode: "LBP", currencyLabel: "ل.ل", currencyName: "ليرة لبنانية", fractionDigits: 2 },
  SY: { currencyCode: "SYP", currencyLabel: "ل.س", currencyName: "ليرة سورية", fractionDigits: 2 },
  IQ: { currencyCode: "IQD", currencyLabel: "د.ع", currencyName: "دينار عراقي", fractionDigits: 3 },
  EG: { currencyCode: "EGP", currencyLabel: "ج.م", currencyName: "جنيه مصري", fractionDigits: 2 },
  SD: { currencyCode: "SDG", currencyLabel: "ج.س", currencyName: "جنيه سوداني", fractionDigits: 2 },
  LY: { currencyCode: "LYD", currencyLabel: "د.ل", currencyName: "دينار ليبي", fractionDigits: 3 },
  TN: { currencyCode: "TND", currencyLabel: "د.ت", currencyName: "دينار تونسي", fractionDigits: 3 },
  DZ: { currencyCode: "DZD", currencyLabel: "د.ج", currencyName: "دينار جزائري", fractionDigits: 2 },
  MA: { currencyCode: "MAD", currencyLabel: "د.م", currencyName: "درهم مغربي", fractionDigits: 2 },
  MR: { currencyCode: "MRU", currencyLabel: "أوقية", currencyName: "أوقية موريتانية", fractionDigits: 2 },
  SO: { currencyCode: "SOS", currencyLabel: "ش.ص", currencyName: "شلن صومالي", fractionDigits: 2 },
  DJ: { currencyCode: "DJF", currencyLabel: "ف.ج", currencyName: "فرنك جيبوتي", fractionDigits: 0 },
  KM: { currencyCode: "KMF", currencyLabel: "ف.ق", currencyName: "فرنك قمري", fractionDigits: 0 },
} as const satisfies Record<BrandPhoneCountry, { currencyCode: string; currencyLabel: string; currencyName: string; fractionDigits: number }>;

export type AccountCurrency = typeof ARAB_ACCOUNT_CURRENCIES[BrandPhoneCountry];
export type AccountCurrencyCode = AccountCurrency["currencyCode"];

export function currencyForCountry(country: string | null | undefined): AccountCurrency {
  return Object.hasOwn(ARAB_ACCOUNT_CURRENCIES, country ?? "")
    ? ARAB_ACCOUNT_CURRENCIES[country as BrandPhoneCountry] : ARAB_ACCOUNT_CURRENCIES.SA;
}

export function currencyByCode(code: string | null | undefined): AccountCurrency {
  return Object.values(ARAB_ACCOUNT_CURRENCIES).find(currency => currency.currencyCode === code) ?? ARAB_ACCOUNT_CURRENCIES.SA;
}

export function formatAccountAmount(amount: number, code?: string, locale = "ar-SA") {
  return amount.toLocaleString(locale, { maximumFractionDigits: currencyByCode(code).fractionDigits });
}

export function formatAccountMoney(amount: number, code?: string, locale = "ar-SA") {
  const currency = currencyByCode(code);
  // Preserve the existing Saudi owner-catalog number presentation.
  const number = currency.currencyCode === "SAR" ? amount.toLocaleString(locale) : formatAccountAmount(amount, code, locale);
  return `${number} ${currency.currencyLabel}`;
}

export function menuCurrencyLabel(code?: string) {
  const currency = currencyByCode(code);
  return currency.currencyCode === "SAR" ? "ريال" : currency.currencyLabel;
}
