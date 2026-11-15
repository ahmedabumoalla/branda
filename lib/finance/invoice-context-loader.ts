"use client";

import {getFinanceInvoiceBootstrap} from "@/app/actions/finance-invoice-bootstrap";

type Bootstrap=Awaited<ReturnType<typeof getFinanceInvoiceBootstrap>>;

/** One form instance only: share in-flight reads, never completed account/draft data. */
export function createInvoiceContextLoader(slug:string){
 const pending=new Map<string|null,Promise<Bootstrap>>();
 function load(draftId:string|null){
  const existing=pending.get(draftId);
  if(existing)return existing;
  const request=getFinanceInvoiceBootstrap(slug,draftId);
  pending.set(draftId,request);
  const release=()=>{if(pending.get(draftId)===request)pending.delete(draftId);};
  void request.then(release,release);
  return request;
 }
 return{
  orderSource:(draftId:string|null)=>load(draftId).then(result=>result.orderSource),
  lineNotes:(draftId:string|null)=>load(draftId).then(result=>result.lineNotes),
  shippingCharge:(draftId:string|null)=>load(draftId).then(result=>result.shippingCharge),
  customFields:(draftId:string|null)=>load(draftId).then(result=>result.customFields),
  settings:()=>load(null).then(result=>result.settings),
  inventoryCatalog:()=>load(null).then(result=>result.inventoryCatalog),
  issuer:()=>load(null).then(result=>result.issuer),
 };
}
