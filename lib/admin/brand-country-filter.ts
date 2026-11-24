import { z } from "zod";
import { isBrandPhoneCountry } from "@/lib/auth/brand-phone";

export const brandCountryFilterSchema = z.string().refine(value => value === "" || isBrandPhoneCountry(value), "Invalid brand country").default("");
