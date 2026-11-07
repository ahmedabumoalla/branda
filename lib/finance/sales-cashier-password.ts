export const SALES_CASHIER_PASSWORD_HINT = "من ٨ إلى ١٢٨ خانة ويمكن استخدام الأرقام فقط";
export const SALES_CASHIER_PASSWORD_PATTERN = String.raw`(?=.*\S).{8,128}`;

export function isSalesCashierPassword(value: string) {
  return value.length >= 8 && value.length <= 128 && value.trim().length > 0 && !/[\r\n]/.test(value);
}
