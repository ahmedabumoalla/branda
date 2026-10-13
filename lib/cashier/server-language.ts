import "server-only";
import { cookies } from "next/headers";
import { cashierLanguageCookie, cashierLocale } from "./language";
export async function getCashierLocale() { return cashierLocale((await cookies()).get(cashierLanguageCookie)?.value); }
