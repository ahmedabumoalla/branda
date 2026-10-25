export const SALES_CASHIER_PASSWORD_HINT = "٨ خانات على الأقل تتضمن حرفًا إنجليزيًا كبيرًا ورمزًا";
export const SALES_CASHIER_PASSWORD_PATTERN = String.raw`(?=.*[A-Z])(?=.*[\p{P}\p{S}]).{8,128}`;

export function isSalesCashierPassword(value: string) {
  return value.length >= 8 && value.length <= 128 && /[A-Z]/.test(value) && /[\p{P}\p{S}]/u.test(value) && !/[\r\n]/.test(value);
}
