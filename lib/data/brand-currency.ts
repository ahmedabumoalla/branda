import "server-only";
import { cache } from "react";
import { getBrandPhoneCountry } from "@/lib/data/brand-phone-country";
import { currencyForCountry } from "@/lib/currency/account-currency";

/** Call after authorizing the account; never use a visitor or staff phone. */
export const getBrandCurrency = cache(async (cafeId: string) => currencyForCountry(await getBrandPhoneCountry(cafeId)));
