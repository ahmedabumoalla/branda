import { readFile } from "node:fs/promises";

const baseline = await readFile("scripts/check-gift-commerce-db.mjs", "utf8");
const anchor = " const cashAccount=snap.accounts.find(a=>a.kind==='cash').id;";
if (!baseline.includes(anchor)) throw new Error("Gift review fixture anchor missing");
const extra = String.raw`
 const lowPriceProduct=crypto.randomUUID();
 await db.query("INSERT INTO menu_products(id,cafe_id,name,price) VALUES($1,$2,'Low price product',0.01)",[lowPriceProduct,tenant]);
 const smallOrder=await checkout(body(Array.from({length:30},()=>item(lowPriceProduct,1,[])),0.30,{fulfillment:'pickup'}));
 const smallReceipt=await command(smallOrder.id,'confirm_payment',{amount:0.30,accountId:bankAccount,warehouseId:wh});
 eq(Number(await scalar('SELECT sum(net+tax) FROM bf_document_lines WHERE document_id=$1',[smallReceipt.financeDocumentId])),0.30,'rounded tax allocation preserves tiny line totals');
 eq(Number(await scalar('SELECT count(*) FROM bf_document_lines WHERE document_id=$1 AND (net<0 OR tax<0)',[smallReceipt.financeDocumentId])),0,'rounded tax never produces negative lines');
 await giftRun('settings',{vatRate:15,taxInclusive:false,closedThrough:''});
 const smallExclusive=await checkout(body(Array.from({length:30},()=>item(lowPriceProduct,1,[])),0.35,{fulfillment:'pickup'}));
 const exclusiveReceipt=await command(smallExclusive.id,'confirm_payment',{amount:0.35,accountId:bankAccount,warehouseId:wh});
 eq(Number(await scalar('SELECT sum(tax) FROM bf_document_lines WHERE document_id=$1',[exclusiveReceipt.financeDocumentId])),0.05,'exclusive small line taxes match the document');
 eq(Number(await scalar('SELECT sum(net+tax) FROM bf_document_lines WHERE document_id=$1',[exclusiveReceipt.financeDocumentId])),0.35,'exclusive allocation preserves payable amount');
 await giftRun('settings',{vatRate:15,taxInclusive:true,closedThrough:''});
 await setting({...settings,enabled:false});eq((await cfg()).enabled,false,'disabled settings remain readable for owner reactivation');await setting(settings);
`;
const reportError = console.error;
console.error = (error, ...args) => error instanceof Error
  ? reportError(`${error.name}: ${error.message}`)
  : reportError(error, ...args);
try {
  await import("data:text/javascript;base64," + Buffer.from(baseline.replace(anchor, extra + anchor)).toString("base64"));
} finally {
  console.error = reportError;
}
