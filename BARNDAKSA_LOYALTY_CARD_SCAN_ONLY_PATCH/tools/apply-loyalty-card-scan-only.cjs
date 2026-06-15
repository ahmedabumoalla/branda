const fs = require("fs");
const path = require("path");

const root = process.argv[2] || process.cwd();
const backupRoot = path.join(root, ".barndaksa-patch-backups", `loyalty-card-scan-only-${new Date().toISOString().replace(/[:.]/g, "-")}`);

function toAbs(rel) {
  return path.join(root, rel.split("/").join(path.sep));
}

function read(rel) {
  const file = toAbs(rel);
  if (!fs.existsSync(file)) {
    console.warn(`SKIP missing: ${rel}`);
    return null;
  }
  return fs.readFileSync(file, "utf8");
}

function write(rel, content, original) {
  const file = toAbs(rel);
  if (original === content) {
    console.log(`UNCHANGED ${rel}`);
    return;
  }
  const backupFile = path.join(backupRoot, rel.split("/").join(path.sep));
  fs.mkdirSync(path.dirname(backupFile), { recursive: true });
  fs.copyFileSync(file, backupFile);
  fs.writeFileSync(file, content, "utf8");
  console.log(`PATCHED ${rel}`);
}

function replaceFunction(content, functionName, newFunction) {
  const marker = `export async function ${functionName}`;
  const start = content.indexOf(marker);
  if (start === -1) throw new Error(`Function not found: ${functionName}`);

  const signatureEndMatch = /\n\}\)\s*\{/.exec(content.slice(start));
  if (!signatureEndMatch || typeof signatureEndMatch.index !== "number") {
    throw new Error(`Function body start not found: ${functionName}`);
  }

  const bodyBrace = start + signatureEndMatch.index + signatureEndMatch[0].lastIndexOf("{");
  let depth = 0;
  for (let i = bodyBrace; i < content.length; i++) {
    const char = content[i];
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth === 0) {
      return content.slice(0, start) + newFunction.trimEnd() + content.slice(i + 1);
    }
  }
  throw new Error(`Function end not found: ${functionName}`);
}


function replaceJsxContainerByNeedle(content, needle, startTag, endTag, replacement) {
  const needleIndex = content.indexOf(needle);
  if (needleIndex === -1) return content;
  const start = content.lastIndexOf(startTag, needleIndex);
  const end = content.indexOf(endTag, needleIndex);
  if (start === -1 || end === -1) return content;
  return content.slice(0, start) + replacement.trimEnd() + content.slice(end + endTag.length);
}

function patchScanner() {
  const rel = "components/loyalty/barcode-camera-scanner.tsx";
  const original = read(rel);
  if (!original) return;
  let content = original;
  const oldBlock = `            const rawValue = codes[0]?.rawValue?.trim();
            const value = rawValue ? parseBarndaksaQrPayload(rawValue, expectedKind) : null;
            if (value) {
              onDetected(value);
              setOpen(false);
              return;
            }`;
  const newBlock = `            const rawValue = codes[0]?.rawValue?.trim();
            const parsedValue = rawValue ? parseBarndaksaQrPayload(rawValue, expectedKind) : null;
            const isSecureBarndaksaPayload = rawValue?.startsWith("BARNDAKSA_QR:") ?? false;
            const value =
              parsedValue ??
              (expectedKind === "loyalty-card" && rawValue && !isSecureBarndaksaPayload
                ? rawValue.trim().toUpperCase()
                : null);
            if (value) {
              onDetected(value);
              setOpen(false);
              return;
            }`;
  if (!content.includes(newBlock)) content = content.replace(oldBlock, newBlock);
  write(rel, content, original);
}

function patchCashierActions() {
  const rel = "app/actions/cashier.ts";
  const original = read(rel);
  if (!original) return;
  let content = original;
  content = content.replace(
`export async function cashierScanLoyaltyAction(input: {
  cafeId: string;
  cardCode: string;
  invoiceBarcode: string;
  invoiceAmount: number;
  operation: "stamp" | "redeem";
}) {`,
`export async function cashierScanLoyaltyAction(input: {
  cafeId: string;
  cardCode: string;
  invoiceBarcode?: string;
  invoiceAmount?: number;
  operation?: "stamp" | "redeem";
}) {`
  );
  write(rel, content, original);
}

function patchOwnerActions() {
  const rel = "app/actions/loyalty-cards.ts";
  const original = read(rel);
  if (!original) return;
  let content = original;
  content = content.replace(
`export async function recordLoyaltyCardOperationAction(input: {
  cardCode: string;
  invoiceBarcode: string;
  invoiceAmount: number;
  operation: "stamp" | "redeem";
}) {`,
`export async function recordLoyaltyCardOperationAction(input: {
  cardCode: string;
  invoiceBarcode?: string;
  invoiceAmount?: number;
  operation?: "stamp" | "redeem";
}) {`
  );
  write(rel, content, original);
}

const makeReferenceHelper = `function makeLoyaltyScanReference(cardCode: string) {
  const normalized =
    cardCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "")
      .slice(0, 64) || "CARD";
  const suffix = Math.random().toString(36).slice(2, 10).toUpperCase();
  return \`LOYALTY-CARD-\${normalized}-\${Date.now()}-\${suffix}\`;
}
`;

function ensureReferenceHelper(content) {
  if (content.includes("function makeLoyaltyScanReference")) return content;
  const anchor = "export async function cashierScanLoyalty";
  if (content.includes(anchor)) return content.replace(anchor, `${makeReferenceHelper}\n${anchor}`);
  const ownerAnchor = "export async function recordOwnerLoyaltyOperation";
  if (content.includes(ownerAnchor)) return content.replace(ownerAnchor, `${makeReferenceHelper}\n${ownerAnchor}`);
  return content;
}

function patchCashierData() {
  const rel = "lib/data/cashier.ts";
  const original = read(rel);
  if (!original) return;
  let content = ensureReferenceHelper(original);
  const nextFunction = `export async function cashierScanLoyalty(input: {
  cafeId: string;
  cardCode: string;
  invoiceBarcode?: string;
  invoiceAmount?: number;
  operation?: "stamp" | "redeem";
}) {
  const token = await getCashierToken();
  if (!token) throw new Error("جلسة الكاشير منتهية");

  const normalizedCardCode =
    parseBarndaksaQrPayload(input.cardCode, "loyalty-card") ??
    input.cardCode.trim().toUpperCase();

  const normalizedInvoiceBarcode = input.invoiceBarcode?.trim()
    ? parseBarndaksaQrPayload(input.invoiceBarcode, "invoice") ?? input.invoiceBarcode.trim()
    : makeLoyaltyScanReference(normalizedCardCode);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_loyalty_card_operation", {
    p_cafe_id: input.cafeId,
    p_card_code: normalizedCardCode,
    p_invoice_barcode: normalizedInvoiceBarcode,
    p_invoice_amount: input.invoiceAmount ?? 0,
    p_operation: input.operation ?? "stamp",
    p_cashier_session_token: token,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}`;
  content = replaceFunction(content, "cashierScanLoyalty", nextFunction);
  write(rel, content, original);
}

function patchLoyaltyCardsData() {
  const rel = "lib/data/loyalty-cards.ts";
  const original = read(rel);
  if (!original) return;
  let content = ensureReferenceHelper(original);
  const nextFunction = `export async function recordOwnerLoyaltyOperation(input: {
  cardCode: string;
  invoiceBarcode?: string;
  invoiceAmount?: number;
  operation?: "stamp" | "redeem";
}) {
  const parsed = z.object({
    cardCode: z.string().min(4).max(500),
    invoiceBarcode: z.string().max(500).optional(),
    invoiceAmount: z.number().min(0).max(999999).optional(),
    operation: z.enum(["stamp", "redeem"]).optional(),
  }).parse(input);

  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const normalizedCardCode =
    parseBarndaksaQrPayload(parsed.cardCode, "loyalty-card") ??
    parsed.cardCode.trim().toUpperCase();

  const normalizedInvoiceBarcode = parsed.invoiceBarcode?.trim()
    ? parseBarndaksaQrPayload(parsed.invoiceBarcode, "invoice") ?? parsed.invoiceBarcode.trim()
    : makeLoyaltyScanReference(normalizedCardCode);

  const { data, error } = await supabase.rpc("record_loyalty_card_operation", {
    p_cafe_id: cafe.id,
    p_card_code: normalizedCardCode,
    p_invoice_barcode: normalizedInvoiceBarcode,
    p_invoice_amount: parsed.invoiceAmount ?? 0,
    p_operation: parsed.operation ?? "stamp",
    p_cashier_session_token: null,
  });

  if (error) throw error;
  return data as Record<string, unknown>;
}`;
  content = replaceFunction(content, "recordOwnerLoyaltyOperation", nextFunction);
  write(rel, content, original);
}

function patchCashierClient() {
  const rel = "components/cashier/cashier-console-client.tsx";
  const original = read(rel);
  if (!original) return;
  let content = original;

  content = content.replace(/\n\s*const \[invoiceBarcode, setInvoiceBarcode\] = useState\(""\);/g, "");
  content = content.replace(/\n\s*const \[invoiceAmount, setInvoiceAmount\] = useState\(""\);/g, "");
  content = content.replace(/\n\s*const \[operation, setOperation\] = useState<"stamp" \| "redeem">\("stamp"\);/g, "");

  const oldFunctionStart = content.indexOf("  async function scanLoyalty()");
  if (oldFunctionStart !== -1) {
    const firstBrace = content.indexOf("{", oldFunctionStart);
    let depth = 0;
    for (let i = firstBrace; i < content.length; i++) {
      if (content[i] === "{") depth++;
      if (content[i] === "}") depth--;
      if (depth === 0) {
        const nextFunction = `  async function scanLoyalty(detectedCardCode?: string) {
    const rawCardCode = detectedCardCode ?? cardCode;
    if (!rawCardCode.trim()) {
      setMessage("أدخل QR بطاقة العميل");
      return;
    }
    setBusy(true);
    try {
      const parsedCardCode =
        parseBarndaksaQrPayload(rawCardCode, "loyalty-card") ??
        rawCardCode.trim().toUpperCase();
      const result = await cashierScanLoyaltyAction({
        cafeId: data.cafe.id,
        cardCode: parsedCardCode,
        operation: "stamp",
      });
      setMessage(\`تم احتساب عملية شراء للعميل \${String(result.customerName)} وإضافة ختم في بطاقة الولاء\`);
      setCardCode("");
    } catch {
      setMessage("تعذر احتساب عملية الشراء من بطاقة الولاء");
    } finally {
      setBusy(false);
    }
  }`;
        content = content.slice(0, oldFunctionStart) + nextFunction + content.slice(i + 1);
        break;
      }
    }
  }

  const cashierScanSection = `          <section className="rounded-[28px] bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-xl font-black">
              <ScanLine className="h-6 w-6 text-[#6B3A25]" /> قراءة QR بطاقة الولاء
            </h2>
            <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">
              اقرأ QR بطاقة العميل فقط، وسيتم احتساب عملية شراء مباشرة وإضاءة كوب في بطاقة الولاء.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
              <input
                className="rounded-2xl bg-[#F8F4EF] px-4 py-4 font-bold"
                placeholder="QR بطاقة العميل أو الكود"
                value={cardCode}
                onChange={(e) => setCardCode(e.target.value.toUpperCase())}
              />
              <button
                onClick={() => scanLoyalty()}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl bg-[#D9A33F] px-4 py-3 text-sm font-black text-[#311912] disabled:opacity-60"
              >
                <BadgeCheck className="h-4 w-4" /> احتساب عملية شراء
              </button>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <BarcodeCameraScanner
                label="قراءة QR بطاقة العميل"
                expectedKind="loyalty-card"
                onDetected={(value) => {
                  setCardCode(value.toUpperCase());
                  void scanLoyalty(value);
                }}
              />
            </div>
          </section>`;
  content = replaceJsxContainerByNeedle(content, "قراءة QR بطاقة", "          <section", "          </section>", cashierScanSection);
  content = content.replace(/الفاتورة \{String\(log\.invoiceBarcode \|\| "-"\)\}/g, `مرجع العملية {String(log.invoiceBarcode || "-")}`);

  write(rel, content, original);
}

function patchOwnerLoyaltyPage() {
  const rel = "components/dashboard/pages/loyalty-cards-page.tsx";
  const original = read(rel);
  if (!original) return;
  let content = original;

  content = content.replace(/\n\s*const \[invoiceBarcode, setInvoiceBarcode\] = useState\(""\);/g, "");
  content = content.replace(/\n\s*const \[invoiceAmount, setInvoiceAmount\] = useState\(""\);/g, "");
  content = content.replace(/\n\s*const \[operation, setOperation\] = useState<"stamp" \| "redeem">\("stamp"\);/g, "");

  const oldStart = content.indexOf("  async function runScan()");
  if (oldStart !== -1) {
    const firstBrace = content.indexOf("{", oldStart);
    let depth = 0;
    for (let i = firstBrace; i < content.length; i++) {
      if (content[i] === "{") depth++;
      if (content[i] === "}") depth--;
      if (depth === 0) {
        const nextFunction = `  async function runScan(detectedCardCode?: string) {
    const rawCardCode = detectedCardCode ?? cardCode;
    if (!rawCardCode.trim()) {
      setMessage("أدخل QR بطاقة العميل");
      return;
    }

    setProcessing(true);
    setMessage("");
    try {
      const result = await recordLoyaltyCardOperationAction({
        cardCode: parseBarndaksaQrPayload(rawCardCode, "loyalty-card") ?? rawCardCode.trim().toUpperCase(),
        operation: "stamp",
      });
      setMessage(\`تم احتساب عملية شراء للعميل \${String(result.customerName)} وإضافة ختم في بطاقة الولاء\`);
      setCardCode("");
    } catch {
      setMessage("تعذر احتساب عملية الشراء من بطاقة الولاء");
    } finally {
      setProcessing(false);
    }
  }`;
        content = content.slice(0, oldStart) + nextFunction + content.slice(i + 1);
        break;
      }
    }
  }

  const ownerScanCard = `        <BentoCard variant="white" span="2">
          <h2 className="flex items-center gap-2 text-xl font-black text-[#311912]"><ScanLine className="h-6 w-6 text-[#6B3A25]" />قارئ QR بطاقة الولاء</h2>
          <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">اقرأ QR بطاقة العميل فقط، وسيتم احتساب عملية شراء مباشرة وإضافة ختم في بطاقة الولاء.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
            <NeumoInput placeholder="QR بطاقة العميل أو الكود" value={cardCode} onChange={(e) => setCardCode(e.target.value.toUpperCase())} />
            <PrimaryButton onClick={() => runScan()} disabled={processing}><BadgeCheck className="h-4 w-4" />احتساب عملية شراء</PrimaryButton>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <BarcodeCameraScanner label="قراءة QR بطاقة العميل" expectedKind="loyalty-card" onDetected={(value) => { setCardCode(value.toUpperCase()); void runScan(value); }} />
          </div>
        </BentoCard>`;
  content = replaceJsxContainerByNeedle(content, "قارئ QR", "        <BentoCard", "        </BentoCard>", ownerScanCard);
  content = content.replace(/الفاتورة \{activity\.invoiceBarcode \|\| "-"\}/g, `مرجع العملية {activity.invoiceBarcode || "-"}`);

  write(rel, content, original);
}

patchScanner();
patchCashierActions();
patchOwnerActions();
patchCashierData();
patchLoyaltyCardsData();
patchCashierClient();
patchOwnerLoyaltyPage();

console.log("\nBackups saved in:");
console.log(backupRoot);
