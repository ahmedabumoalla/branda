import type {InventoryCatalog} from './inventory';

export type TemplateUnit = {name: string; factor: number};
export type UnitTemplateRow = {id: string; name: string; parentId: string; count: string};
export type UnitTemplateDraft = {baseName: string; rows: UnitTemplateRow[]; originalUnits: TemplateUnit[]; originalLayout: string};
export type UnitTemplateHierarchy = {version: 1; baseName: string; rows: {name: string; parentName: string; count: string}[]};
const ZERO = BigInt(0);
const SCALE = BigInt(1_000_000);
const MAX = SCALE * SCALE;
const cleanName = (name: string) => name.trim();
const layoutKey = (draft: Pick<UnitTemplateDraft, 'baseName' | 'rows'>) => JSON.stringify([draft.baseName, draft.rows]);

function decimal(value: string): bigint {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value.trim())) throw new Error('أدخل عددًا موجبًا بدقة لا تتجاوز ٦ منازل عشرية');
  const [whole, fraction = ''] = value.trim().split('.');
  const result = BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, '0'));
  if (result <= ZERO || result > MAX) throw new Error('عدد الوحدات يجب أن يكون أكبر من صفر ولا يتجاوز مليونًا');
  return result;
}

function hierarchy(draft: UnitTemplateDraft): UnitTemplateHierarchy {
  const names = new Map([['base', cleanName(draft.baseName)], ...draft.rows.map(row => [row.id, cleanName(row.name)] as [string, string])]);
  return {version: 1, baseName: cleanName(draft.baseName), rows: draft.rows.map(row => ({name: cleanName(row.name), parentName: names.get(row.parentId) ?? '', count: row.count.trim()}))};
}

export function compileUnitTemplate(draft: UnitTemplateDraft): {units: TemplateUnit[]; unitHierarchy: UnitTemplateHierarchy} {
  if (!draft.baseName.trim()) throw new Error('اختر الوحدة الأساسية');
  // Existing flat templates may have non-terminating relative ratios or a different
  // array order. An untouched conversion must survive a name-only edit exactly.
  if (draft.originalUnits.length && layoutKey(draft) === draft.originalLayout) return {units: draft.originalUnits.map(unit => ({...unit})), unitHierarchy: hierarchy(draft)};
  if (draft.rows.length > 29) throw new Error('القالب يدعم حتى ٣٠ وحدة مع الوحدة الأساسية');
  const baseName = cleanName(draft.baseName);
  const names = new Set<string>();
  const validName = (name: string) => {
    if (!name || name.length > 30) throw new Error('اسم الوحدة مطلوب وبحد أقصى ٣٠ حرفًا');
    const normalized = name.normalize('NFKC').toLocaleLowerCase();
    if (names.has(normalized)) throw new Error('أسماء الوحدات يجب ألا تتكرر');
    names.add(normalized);
  };
  validName(baseName);
  const factors = new Map<string, bigint>([['base', SCALE]]);
  const units: TemplateUnit[] = [{name: baseName, factor: 1}];
  for (const row of draft.rows) {
    const name = cleanName(row.name);
    validName(name);
    const parent = factors.get(row.parentId);
    if (!parent || row.id === 'base' || factors.has(row.id)) throw new Error('اختر وحدة سابقة صحيحة لكل مستوى');
    const count = decimal(row.count);
    const product = count * parent;
    if (product % SCALE !== ZERO) throw new Error('التحويل الناتج يتجاوز دقة ٦ منازل عشرية عدّل عدد الوحدات');
    const factor = product / SCALE;
    if (factor <= ZERO || factor > MAX) throw new Error('إجمالي التحويل إلى الوحدة الأساسية يجب ألا يتجاوز مليونًا');
    if (factor === SCALE) throw new Error('يجب أن تكون الوحدة الإضافية مختلفة في الكمية عن الوحدة الأساسية');
    const original = draft.originalUnits.find(unit => unit.name === name && unit.factor === Number(factor) / Number(SCALE));
    if ((count < SCALE || factor < SCALE) && !original) throw new Error('الوحدة الأكبر تحتوي وحدة سابقة واحدة على الأقل');
    factors.set(row.id, factor);
    units.push({name, factor: Number(factor) / Number(SCALE)});
  }
  // Preserve the historical array order as well as exact factors when equivalent.
  const unchanged = draft.originalUnits.length === units.length && draft.originalUnits.every(original => units.some(unit => unit.name === original.name && unit.factor === original.factor));
  return {units: unchanged ? draft.originalUnits.map(unit => ({...unit})) : units, unitHierarchy: hierarchy(draft)};
}

export function unitTemplateDraft(template?: Pick<InventoryCatalog, 'payload'>): UnitTemplateDraft {
  const source = template?.payload.units;
  const originalUnits = Array.isArray(source) ? source.filter((unit): unit is TemplateUnit => !!unit && typeof unit === 'object' && typeof unit.name === 'string' && typeof unit.factor === 'number' && Number.isFinite(unit.factor)).map(unit => ({name: unit.name, factor: unit.factor})) : [];
  const base = originalUnits.find(unit => unit.factor === 1);
  const draft: UnitTemplateDraft = {baseName: base?.name ?? '', rows: originalUnits.filter(unit => unit !== base).map((unit, index) => ({id: `unit-${index}`, name: unit.name, parentId: 'base', count: String(unit.factor)})), originalUnits, originalLayout: ''};
  const saved = template?.payload.unitHierarchy as UnitTemplateHierarchy | undefined;
  if (saved?.version === 1 && saved.baseName === draft.baseName && Array.isArray(saved.rows) && saved.rows.length === draft.rows.length && saved.rows.every(row => row && typeof row.name === 'string' && typeof row.parentName === 'string' && (typeof row.count === 'string' || typeof row.count === 'number'))) {
    const ids = new Map<string, string>([[draft.baseName, 'base']]);
    const rows = saved.rows.map((row, index) => { const id = `unit-${index}`; const parentId = ids.get(row.parentName) ?? ''; ids.set(row.name, id); return {id, name: row.name, parentId, count: String(row.count)}; });
    try {
      const compiled = compileUnitTemplate({...draft, rows});
      if (compiled.units.length === originalUnits.length && compiled.units.every(unit => originalUnits.some(original => original.name === unit.name && original.factor === unit.factor))) draft.rows = rows;
    } catch { /* Invalid hierarchy metadata never replaces the original flat factors */ }
  }
  draft.originalLayout = layoutKey(draft);
  return draft;
}

export function unitTemplateFactors(draft: UnitTemplateDraft): Map<string, number> {
  const factors = new Map<string, number>();
  if (draft.originalUnits.length && layoutKey(draft) === draft.originalLayout) {
    for (const row of draft.rows) {
      const unit = draft.originalUnits.find(unit => unit.name === row.name);
      if (unit) factors.set(row.id, unit.factor);
    }
    return factors;
  }
  for (let index = 0; index < draft.rows.length; index++) {
    try {
      const row = draft.rows[index];
      const result = compileUnitTemplate({...draft, rows: draft.rows.slice(0, index + 1)});
      const unit = result.units.find(unit => unit.name === row.name.trim());
      if (unit) factors.set(row.id, unit.factor);
    } catch { /* Incomplete rows have no misleading conversion preview */ }
  }
  return factors;
}
