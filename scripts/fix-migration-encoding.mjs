#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(ROOT, "supabase/migrations/004_branda_critical_security_fixes.sql");
const SEP = "-- =============================================================================";

let s = fs.readFileSync(file, "utf8");

s = s.replace(/^-- Branda Platform .*Critical security fixes$/m, "-- Branda Platform — Critical security fixes");

s = s
  .split("\n")
  .map((line) => {
    if (line.includes("â•") || (line.startsWith("-- ") && line.includes("â") && line.length > 60)) {
      return SEP;
    }
    return line.replace(/\u00E2\u20AC[\u201C\u201D\u2014\u2013]/g, "—").replace(/â€"/g, "—");
  })
  .join("\n");

const fixes = [
  ["'ط·ظ„ط¨ ط§ط³طھظ„ط§ظ… ط¬ط¯ظٹط¯'", "'طلب استلام جديد'"],
  ["'ط·ظ„ط¨ ط¬ط¯ظٹط¯ ظ…ظ† ' || v_profile.full_name", "'طلب جديد من ' || v_profile.full_name"],
  ["'طھظ… ط¥ط±ط³ط§ظ„ ط·ظ„ط¨ظƒ'", "'تم إرسال طلبك'"],
  [
    "'ط·ظ„ط¨ظƒ ' || v_order_id::text || ' ط¨ط§ظ†طھط¸ط§ط± ظ…ظˆط§ظپظ‚ط© ط§ظ„ظƒظˆظپظٹ. ط§ظ„ط¯ظپط¹ ط¹ظ†ط¯ ط§ظ„ط§ط³طھظ„ط§ظ….'",
    "'طلبك ' || v_order_id::text || ' بانتظار موافقة الكوفي. الدفع عند الاستلام.'",
  ],
  ["'ظ…ظƒط§ظپط£ط© ظˆط«ظ‘ظ‚ طھط¬ط±ط¨طھظƒ'", "'مكافأة وثّق تجربتك'"],
  ["'ط­ط¬ط² ط¬ط¯ظٹط¯'", "'حجز جديد'"],
  ["'ط­ط¬ط² ظ…ظ† ' || v_profile.full_name", "'حجز من ' || v_profile.full_name"],
  ["'طھظ… ط¥ط±ط³ط§ظ„ ط·ظ„ط¨ ط§ظ„ط­ط¬ط²'", "'تم إرسال طلب الحجز'"],
  [
    "'ط·ظ„ط¨ظƒ (' || p_event_type || ') ط¨ط§ظ†طھط¸ط§ط± ط±ط¯ ط§ظ„ظƒظˆظپظٹ. ط³ظ†ط¨ظ„ط؛ظƒ ط¹ظ†ط¯ ط§ظ„ظ‚ط¨ظˆظ„ ط£ظˆ ط§ظ„ط±ظپط¶.'",
    "'طلبك (' || p_event_type || ') بانتظار رد الكوفي. سنبلغك عند القبول أو الرفض.'",
  ],
];

for (const [from, to] of fixes) {
  if (!s.includes(from)) {
    console.warn("pattern not found:", from.slice(0, 40));
  }
  s = s.split(from).join(to);
}

fs.writeFileSync(file, s, "utf8");
console.log("fixed:", file);
