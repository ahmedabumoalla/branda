const VAT_RATE = 0.15;

export function roundMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function netOfVat(inclusiveAmount: number) {
  return roundMoney(Number(inclusiveAmount) / (1 + VAT_RATE));
}

export function vatFromInclusive(inclusiveAmount: number) {
  return roundMoney(Number(inclusiveAmount) - netOfVat(inclusiveAmount));
}
