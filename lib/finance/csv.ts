/** Preserve numeric spreadsheet cells while guarding untrusted textual formulas. */
export function financeCsvCell(value: string | number): string {
  const raw = String(value);
  const guarded = typeof value === 'string' && /^[\s]*[=+@-]|^[\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replaceAll('"', '""')}"`;
}
