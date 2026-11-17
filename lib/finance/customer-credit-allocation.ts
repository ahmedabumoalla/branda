/** All balances/limits are SAR. Round the required payment upwards, never the credit allowance. */
export function customerCreditAllocation(totalSar: number, appliedCreditSar: number, availableSar: number, exchangeRate: number) {
  const shortfall = Math.max(0, Math.round((totalSar - appliedCreditSar - availableSar) * 100) / 100);
  const requiredCash = Math.ceil((shortfall / exchangeRate) * 100 - 1e-8) / 100;
  return { requiredCash, creditSar: Math.max(0, Math.round((totalSar - appliedCreditSar - requiredCash * exchangeRate) * 100) / 100) };
}
