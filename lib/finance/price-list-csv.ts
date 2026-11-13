export type PriceListCatalogItem = { id: string; sku: string; name: string; category: string };
export type ImportedPrice = { listId: string; productId: string; price: number; row: number };

export function mergeImportedPrices<T extends { id: string; prices: { productId: string; price: number }[] }>(lists: readonly T[], rows: readonly ImportedPrice[]): T[] {
  if (lists.length > 30) throw new Error("الحد الأقصى ٣٠ قائمة أسعار");
  if (rows.some(row => !lists.some(list => list.id === row.listId))) throw new Error("قائمة الأسعار لم تعد متاحة أعد تحميل البيانات");
  return lists.map(list => {
    const incoming = rows.filter(row => row.listId === list.id);
    if (!incoming.length) return list;
    const prices = new Map(list.prices.map(price => [price.productId, price]));
    for (const row of incoming) prices.set(row.productId, { productId: row.productId, price: row.price });
    if (prices.size > 500) throw new Error("الاستيراد سيجاوز الحد الأقصى وهو ٥٠٠ بند في قائمة واحدة");
    return { ...list, prices: [...prices.values()] };
  });
}

export function priceListAmount(value: string): number | null {
  const normalized = value.trim().replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0)).replace("٫", ".");
  if (!/^(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 && number <= 1_000_000_000 ? number : null;
}

/** Strict RFC 4180-style CSV reader: quoted commas/newlines and escaped quotes, no evaluation. */
function readCsv(text: string) {
  if (text.length > 5_000_000) throw new Error("حجم الملف يتجاوز الحد المسموح وهو ٥ ميجابايت");
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false, closed = false;
  const cell = () => { row.push(value); value = ""; closed = false; };
  const line = () => {
    cell();
    if (row.some(item => item.trim())) rows.push(row);
    row = [];
    if (rows.length > 15_001) throw new Error("الملف يتجاوز ١٥ ألف بند");
  };
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') { value += '"'; index++; }
        else { quoted = false; closed = true; }
      } else value += char;
    } else if (char === ",") cell();
    else if (char === "\n" || char === "\r") { if (char === "\r" && input[index + 1] === "\n") index++; line(); }
    else if (char === '"' && !value && !closed) quoted = true;
    else if (closed || char === '"') throw new Error("تنسيق علامات الاقتباس غير صالح في ملف الأسعار");
    else value += char;
  }
  if (quoted) throw new Error("علامة اقتباس غير مغلقة في ملف الأسعار");
  if (value || row.length || closed) line();
  return rows;
}

/** With a target list, list_id is optional; bulk updates require a known list_id per row. */
export function parsePriceListCsv(text: string, catalog: readonly PriceListCatalogItem[], listIds: readonly string[], targetListId?: string): ImportedPrice[] {
  const [header, ...rows] = readCsv(text);
  if (!header || !rows.length) throw new Error("أضف عناوين الأعمدة وبندًا واحدًا على الأقل");
  const columns = header.map(value => value.trim().toLowerCase());
  const allowed = new Set(["list_id", "list_name", "product_id", "sku", "name", "category", "price"]);
  if (columns.some(column => !allowed.has(column)) || new Set(columns).size !== columns.length) throw new Error("استخدم أعمدة القالب دون أعمدة مكررة أو غير معروفة");
  if (!columns.includes("price") || (!columns.includes("product_id") && !columns.includes("sku"))) throw new Error("يجب أن يحتوي الملف على price ومعرف product_id أو كود sku");
  if (!targetListId && !columns.includes("list_id")) throw new Error("التحديث الجماعي يحتاج معرف قائمة الأسعار list_id");
  if (targetListId && !listIds.includes(targetListId)) throw new Error("قائمة الأسعار لم تعد متاحة أعد تحميل البيانات");
  const byId = new Map(catalog.map(item => [item.id, item]));
  const bySku = new Map<string, PriceListCatalogItem[]>();
  for (const item of catalog) if (item.sku) bySku.set(item.sku, [...(bySku.get(item.sku) ?? []), item]);
  const seen = new Set<string>(), counts = new Map<string, number>();
  return rows.map((row, index) => {
    const rowNumber = index + 2;
    const fail = (message: string): never => { throw new Error(`السطر ${rowNumber}: ${message}`); };
    if (row.length !== columns.length) fail("عدد الخانات لا يطابق عناوين الأعمدة");
    const get = (key: string) => row[columns.indexOf(key)]?.trim() ?? "";
    const suppliedList = get("list_id");
    const listId = suppliedList || targetListId || "";
    if (!listIds.includes(listId) || (targetListId && listId !== targetListId)) fail("معرف قائمة الأسعار غير صالح لهذه العملية");
    const id = get("product_id"), sku = get("sku");
    if ((!id && !sku) || /^[=+@\-]/.test(id) || /^[=+@\-]/.test(sku)) fail("أدخل معرف المنتج أو كوده دون معادلات");
    const matches = sku ? bySku.get(sku) ?? [] : [];
    const item = id ? byId.get(id) : matches.length === 1 ? matches[0] : undefined;
    if (!item || (sku && item.sku !== sku)) fail(matches.length > 1 && !id ? "الكود مكرر في الكتالوج استخدم معرف المنتج" : "المنتج أو الكود غير موجود أو لا يتطابقان");
    const price = priceListAmount(get("price"));
    if (price === null) fail("السعر يجب أن يكون رقمًا من صفر إلى مليار وبحد أقصى ٦ منازل عشرية دون فواصل آلاف");
    const productId = item!.id;
    const key = `${listId}:${productId}`;
    if (seen.has(key)) fail("المنتج مكرر في قائمة الأسعار");
    seen.add(key);
    const count = (counts.get(listId) ?? 0) + 1;
    if (count > 500) fail("الحد الأقصى ٥٠٠ بند لكل قائمة أسعار");
    counts.set(listId, count);
    return { listId, productId, price: price!, row: rowNumber };
  });
}
