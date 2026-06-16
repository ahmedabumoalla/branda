const fs = require('fs');
const path = require('path');

const root = process.cwd();
function file(rel){ return path.join(root, rel); }
function read(rel){ return fs.readFileSync(file(rel), 'utf8'); }
function write(rel, data){ fs.mkdirSync(path.dirname(file(rel)), {recursive:true}); fs.writeFileSync(file(rel), data, 'utf8'); }
function backup(rel){ const p=file(rel); if(fs.existsSync(p)) fs.copyFileSync(p, p + '.bak.no-pending-' + Date.now()); }
function replaceOrThrow(rel, from, to, label){
  const before = read(rel);
  const after = typeof from === 'string' ? before.split(from).join(to) : before.replace(from, to);
  if (after === before) throw new Error('PATCH_FAILED ' + label + ' in ' + rel);
  backup(rel);
  write(rel, after);
}

const dataRel = 'lib/data/subscription.ts';
const pageRel = 'components/dashboard/pages/subscription-page.tsx';

if (!fs.existsSync(file(dataRel))) throw new Error('Missing ' + dataRel);
if (!fs.existsSync(file(pageRel))) throw new Error('Missing ' + pageRel);

let data = read(dataRel);
backup(dataRel);

// 1) The DB enum does not support status paid. UI may map active/trialing to paid, but DB filters must not send paid.
data = data.replace(/\.in\(\s*["']status["']\s*,\s*\[\s*["']active["']\s*,\s*["']trialing["']\s*,\s*["']paid["']\s*\]\s*\)/g, '.in("status", ["active", "trialing"])');

// 2) Subscription history should only show real subscriptions, not checkout drafts waiting for payment.
data = data.replace(
  /\.eq\("cafe_id", cafe\.id\)\n\s*\.order\("created_at", \{ ascending: false \}\);/,
  '.eq("cafe_id", cafe.id)\n    .in("status", ["active", "trialing", "cancelled", "expired"])\n    .order("created_at", { ascending: false });'
);

// 3) Do not restore any pending checkout as a saved plan when the page opens.
data = data.replace(
  /export async function getOwnerPendingSubscription\(\): Promise<PendingSubscription \| null> \{[\s\S]*?\n\}/,
  'export async function getOwnerPendingSubscription(): Promise<PendingSubscription | null> {\n  return null;\n}'
);

write(dataRel, data);

let page = read(pageRel);
backup(pageRel);

// 4) Do not refresh history immediately after creating a checkout draft. Only paid/ended records belong in history.
page = page.replace(/\n\s*const nextHistory = await fetchOwnerSubscriptionHistoryAction\(\);\n\s*setHistory\(nextHistory\);/g, '');

// 5) Do not offer payment from expired/failed history records; payment happens only from the invoice step.
page = page.replace(/selectedHistoryRecord\.paymentStatus !== "paid"/g, 'selectedHistoryRecord.paymentStatus === "pending"');

// 6) Remove pending wording from the top hint when rendering current state from server.
page = page.replace(/pending\?\.paymentStatus === "pending"\s*\? "لديك باقة بانتظار الدفع"\s*:\s*undefined/g, 'undefined');

write(pageRel, page);

// 7) Clean obvious stale Next cache.
fs.rmSync(path.join(root, '.next'), {recursive:true, force:true});

const verifyData = read(dataRel);
if (verifyData.includes('["active", "trialing", "paid"]') || verifyData.includes("['active', 'trialing', 'paid']")) {
  throw new Error('VERIFY_FAILED paid is still used inside status filters');
}
if (!verifyData.includes('.in("status", ["active", "trialing", "cancelled", "expired"])')) {
  throw new Error('VERIFY_FAILED history filter was not applied');
}
if (!verifyData.includes('getOwnerPendingSubscription(): Promise<PendingSubscription | null> {\n  return null;')) {
  throw new Error('VERIFY_FAILED pending restore was not disabled');
}

console.log('DONE');
console.log('VERIFIED');
console.log('Pending checkout rows are hidden from subscription history. DB status paid is no longer sent in status filters.');
