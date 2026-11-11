export const customerAddressFields = [
  ["buildingNumber", "رقم المبنى"], ["street", "اسم الشارع"], ["additionalNumber", "الرقم الفرعي"],
  ["district", "الحي"], ["city", "المدينة"], ["postalCode", "الرمز البريدي"], ["shortAddress", "العنوان المختصر"],
] as const;

export const customerIdentifierOptions = [
  "السجل التجاري", "ترخيص وزارة الشؤون البلدية والقروية والإسكان", "ترخيص وزارة الموارد البشرية والتنمية الاجتماعية",
  "ترخيص الهيئة العامة للاستثمار", "رقم 700", "الرقم المميز", "رقم الهوية الوطنية", "رقم الإقامة", "هوية خليجية", "رقم جواز السفر", "أخرى",
] as const;

// ISO 3166-1 regions, displayed with the runtime's Arabic country names.
const countryCodes = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
const countryNames = new Intl.DisplayNames(["ar"], { type: "region" });
export const customerCountries = countryCodes.map(code => ({ code, name: countryNames.of(code) || code })).sort((a, b) => a.name.localeCompare(b.name, "ar"));

export const customerDetailKeys = [
  "legalName", "taxRegistration", "country", "region", "city", "district", "street", "buildingNumber", "additionalNumber", "postalCode", "unitNumber", "shortAddress", "addressNotes", "governmentIdType", "governmentId", "commercialRegistration", "unifiedNumber", "contactName", "notes",
  "customerType", "firstName", "lastName", "telephone", "governmentEntity", "shippingEnabled", "shippingName", "shippingBuildingNumber", "shippingStreet", "shippingAdditionalNumber", "shippingDistrict", "shippingCity", "shippingPostalCode", "shippingShortAddress", "shippingCountry",
  "invoiceMethod", "currency", "classification", "language",
] as const;

export function buildCustomerPayload(form: FormData, id: string, active = true) {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const name = text("name"), phone = text("phone");
  if (!name) throw new Error("أدخل اسم العميل");
  if (name.length > 150) throw new Error("اسم العميل يجب ألا يتجاوز ١٥٠ حرفًا");
  if (!phone) throw new Error("أدخل رقم جوال العميل");
  if (phone.length > 30) throw new Error("رقم الجوال يجب ألا يتجاوز ٣٠ حرفًا");
  const details: Record<string, string> = {};
  for (const key of customerDetailKeys) {
    if (key.startsWith("shipping") && text("shippingEnabled") !== "true") continue;
    const value = text(key);
    if (value.length > (["notes", "addressNotes"].includes(key) ? 2000 : 250)) throw new Error("إحدى بيانات العميل تتجاوز الطول المسموح");
    if (value) details[key] = value;
  }
  const contactKeys = ["firstName", "lastName", "email", "telephone", "phone"] as const;
  const contacts = form.getAll("contact_firstName").map((_, index) => Object.fromEntries(contactKeys.map(key => [key, String(form.getAll(`contact_${key}`)[index] ?? "").trim()]))).filter(row => Object.values(row).some(Boolean));
  if (contacts.length > 10 || contacts.some(row => Object.values(row).some(value => value.length > 250))) throw new Error("راجع بيانات جهات الاتصال");
  details.contacts = JSON.stringify(contacts);
  if (new TextEncoder().encode(JSON.stringify(details)).length > 16000) throw new Error("بيانات العميل أكبر من الحد المسموح");
  return { id, kind: "customer", name, phone, email: text("email"), taxNumber: text("taxNumber"), active, details };
}
