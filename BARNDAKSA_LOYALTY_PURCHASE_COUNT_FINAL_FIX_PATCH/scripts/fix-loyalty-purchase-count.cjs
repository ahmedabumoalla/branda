const fs = require('fs');
const path = require('path');

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const backupRoot = path.join(root, '.barndaksa-patch-backups', `loyalty-purchase-count-final-${new Date().toISOString().replace(/[:.]/g, '-')}`);

function abs(rel) { return path.join(root, rel.split('/').join(path.sep)); }
function exists(rel) { return fs.existsSync(abs(rel)); }
function read(rel) { if (!exists(rel)) { console.log(`SKIP missing ${rel}`); return null; } return fs.readFileSync(abs(rel), 'utf8'); }
function write(rel, content, original) {
  if (original === null) return;
  if (content === original) { console.log(`UNCHANGED ${rel}`); return; }
  const file = abs(rel);
  const backup = path.join(backupRoot, rel.split('/').join(path.sep));
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(file, backup);
  fs.writeFileSync(file, content, 'utf8');
  console.log(`PATCHED ${rel}`);
}
function replaceAll(s, a, b) { return s.split(a).join(b); }

const securePayload = fs.readFileSync(path.join(__dirname, '..', 'files', 'lib', 'loyalty', 'secure-qr-payload.ts'), 'utf8');

function patchSecurePayload(){
  const rel = 'lib/loyalty/secure-qr-payload.ts';
  const original = read(rel);
  if (original === null) return;
  write(rel, securePayload, original);
}

function patchScanner() {
  const rel = 'components/loyalty/barcode-camera-scanner.tsx';
  let content = read(rel);
  if (content === null) return;
  const original = content;

  content = content.replace(
    'import { parseBarndaksaQrPayload, type BarndaksaQrKind } from "@/lib/loyalty/secure-qr-payload";',
    'import { normalizeLoyaltyCardScanValue, parseBarndaksaQrPayload, type BarndaksaQrKind } from "@/lib/loyalty/secure-qr-payload";'
  );

  // Avoid duplicate import if the previous patch already partially changed it.
  content = content.replace(
    'import { normalizeLoyaltyCardScanValue, normalizeLoyaltyCardScanValue, parseBarndaksaQrPayload, type BarndaksaQrKind } from "@/lib/loyalty/secure-qr-payload";',
    'import { normalizeLoyaltyCardScanValue, parseBarndaksaQrPayload, type BarndaksaQrKind } from "@/lib/loyalty/secure-qr-payload";'
  );

  content = content.replace(
`            const parsedValue = rawValue ? parseBarndaksaQrPayload(rawValue, expectedKind) : null;
            const isSecureBarndaksaPayload = rawValue?.startsWith("BARNDAKSA_QR:") ?? false;
            const value =
              parsedValue ??
              (expectedKind === "loyalty-card" && rawValue && !isSecureBarndaksaPayload
                ? rawValue.trim().toUpperCase()
                : null);`,
`            const parsedValue = rawValue ? parseBarndaksaQrPayload(rawValue, expectedKind) : null;
            const value =
              expectedKind === "loyalty-card" && rawValue
                ? normalizeLoyaltyCardScanValue(rawValue)
                : parsedValue;`
  );

  content = content.replace(
`            const rawValue = codes[0]?.rawValue?.trim();
            const value = rawValue ? parseBarndaksaQrPayload(rawValue, expectedKind) : null;`,
`            const rawValue = codes[0]?.rawValue?.trim();
            const parsedValue = rawValue ? parseBarndaksaQrPayload(rawValue, expectedKind) : null;
            const value =
              expectedKind === "loyalty-card" && rawValue
                ? normalizeLoyaltyCardScanValue(rawValue)
                : parsedValue;`
  );

  content = content.replace(/let timer: NodeJS\.Timeout \| null = null;/g, 'let timer: ReturnType<typeof window.setTimeout> | null = null;');
  content = content.replace(/let timer: ReturnType<typeof setTimeout> \| null = null;/g, 'let timer: ReturnType<typeof window.setTimeout> | null = null;');

  write(rel, content, original);
}

function patchScanClients() {
  const files = [
    'components/cashier/cashier-console-client.tsx',
    'components/dashboard/pages/loyalty-cards-page.tsx',
  ];

  for (const rel of files) {
    let content = read(rel);
    if (content === null) continue;
    const original = content;

    content = content.replace(
      'import { parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";',
      'import { normalizeLoyaltyCardScanValue, parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";'
    );
    content = content.replace(
      'import { normalizeLoyaltyCardScanValue, normalizeLoyaltyCardScanValue, parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";',
      'import { normalizeLoyaltyCardScanValue, parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";'
    );

    content = replaceAll(content,
`parseBarndaksaQrPayload(rawCardCode, "loyalty-card") ??
        rawCardCode.trim().toUpperCase()`,
`normalizeLoyaltyCardScanValue(rawCardCode)`
    );
    content = replaceAll(content,
`parseBarndaksaQrPayload(rawCardCode, "loyalty-card") ?? rawCardCode.trim().toUpperCase()`,
`normalizeLoyaltyCardScanValue(rawCardCode)`
    );

    const detailedCatch = 'catch (error) {\n      const reason = error instanceof Error && error.message ? `: ${error.message}` : "";\n      setMessage(`تعذر احتساب عملية الشراء من بطاقة الولاء${reason}`);\n    }';
    content = content.replace(/catch \{\s*setMessage\("تعذر احتساب عملية الشراء من بطاقة الولاء"\);\s*\}/g, detailedCatch);

    // Remove unused parse import if the file no longer calls it directly.
    if (!content.includes('parseBarndaksaQrPayload(')) {
      content = content.replace(
        'import { normalizeLoyaltyCardScanValue, parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";',
        'import { normalizeLoyaltyCardScanValue } from "@/lib/loyalty/secure-qr-payload";'
      );
    }

    write(rel, content, original);
  }
}

function patchDataFiles() {
  const files = ['lib/data/cashier.ts', 'lib/data/loyalty-cards.ts'];
  for (const rel of files) {
    let content = read(rel);
    if (content === null) continue;
    const original = content;

    content = content.replace(
      'import { parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";',
      'import { normalizeLoyaltyCardScanValue, parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";'
    );
    content = content.replace(
      'import { normalizeLoyaltyCardScanValue, normalizeLoyaltyCardScanValue, parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";',
      'import { normalizeLoyaltyCardScanValue, parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";'
    );

    content = replaceAll(content,
`const normalizedCardCode =
    parseBarndaksaQrPayload(input.cardCode, "loyalty-card") ??
    input.cardCode.trim().toUpperCase();`,
`const normalizedCardCode = normalizeLoyaltyCardScanValue(input.cardCode);`
    );
    content = replaceAll(content,
`const normalizedCardCode =
    parseBarndaksaQrPayload(parsed.cardCode, "loyalty-card") ??
    parsed.cardCode.trim().toUpperCase();`,
`const normalizedCardCode = normalizeLoyaltyCardScanValue(parsed.cardCode);`
    );

    // Keep invoice parsing import if needed. Remove parse import only when no direct use remains.
    if (!content.includes('parseBarndaksaQrPayload(')) {
      content = content.replace(
        'import { normalizeLoyaltyCardScanValue, parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";',
        'import { normalizeLoyaltyCardScanValue } from "@/lib/loyalty/secure-qr-payload";'
      );
    }

    content = content.replace(/if \(error\) throw error;/g, `if (error) throw new Error(error.message || "LOYALTY_OPERATION_FAILED");`);

    write(rel, content, original);
  }
}

function patchActionTypes() {
  const edits = [
    {
      rel: 'app/actions/cashier.ts',
      from: `export async function cashierScanLoyaltyAction(input: {
  cafeId: string;
  cardCode: string;
  invoiceBarcode: string;
  invoiceAmount: number;
  operation: "stamp" | "redeem";
}) {`,
      to: `export async function cashierScanLoyaltyAction(input: {
  cafeId: string;
  cardCode: string;
  invoiceBarcode?: string;
  invoiceAmount?: number;
  operation?: "stamp" | "redeem";
}) {`,
    },
    {
      rel: 'app/actions/loyalty-cards.ts',
      from: `export async function recordLoyaltyCardOperationAction(input: {
  cardCode: string;
  invoiceBarcode: string;
  invoiceAmount: number;
  operation: "stamp" | "redeem";
}) {`,
      to: `export async function recordLoyaltyCardOperationAction(input: {
  cardCode: string;
  invoiceBarcode?: string;
  invoiceAmount?: number;
  operation?: "stamp" | "redeem";
}) {`,
    },
  ];

  for (const edit of edits) {
    let content = read(edit.rel);
    if (content === null) continue;
    const original = content;
    content = content.replace(edit.from, edit.to);
    write(edit.rel, content, original);
  }
}

patchSecurePayload();
patchScanner();
patchScanClients();
patchDataFiles();
patchActionTypes();

console.log('\nBackups saved in:');
console.log(backupRoot);
