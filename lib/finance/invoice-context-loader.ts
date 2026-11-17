"use client";

import {getFinanceInvoiceBootstrap} from "@/app/actions/finance-invoice-bootstrap";
import {getFinanceOrderSourceContext} from "@/app/actions/finance-order-sources";
import {getFinanceInvoiceLineNoteContext} from "@/app/actions/finance-invoice-line-notes";
import {getFinanceInvoiceShippingChargeContext} from "@/app/actions/finance-invoice-shipping-charge";
import {getFinanceInvoiceCustomFieldContext} from "@/app/actions/finance-invoice-custom-fields";
import {getFinanceInvoiceSettings} from "@/app/actions/finance-invoice-settings";
import {companyInvoiceIssuerAction} from "@/app/actions/finance-company-invoices";

type Bootstrap=Awaited<ReturnType<typeof getFinanceInvoiceBootstrap>>;

/** One form instance only: share in-flight reads, never completed account/draft data. */
export function createInvoiceContextLoader(slug:string,onDemand=false){
 const keys=['settings','orderSource','lineNotes','shippingCharge','customFields','issuer'] as const;
 type Key=typeof keys[number];
 const gates=new Map<Key,{promise:Promise<void>;release:()=>void}>();
 for(const key of keys){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});gates.set(key,{promise,release});}
 const activated=new Set<Key>();
 const activate=(key?:Key)=>{for(const name of key?[key]:onDemand?(['settings','issuer'] as const):keys){activated.add(name);gates.get(name)!.release();}};
 const isActive=(key:Key)=>!onDemand||activated.has(key);
 const restore=()=>{for(const key of keys)activate(key);};
 const intentRequests=new Map<string,Promise<unknown>>();
 const afterIntent=<T>(key:Key,read:()=>Promise<T>,draftId:string|null=null):Promise<T>=>{
  const identity=JSON.stringify([key,draftId]);
  const existing=intentRequests.get(identity);
  if(existing)return existing as Promise<T>;
  const request=gates.get(key)!.promise.then(read);
  intentRequests.set(identity,request);
  const release=()=>{if(intentRequests.get(identity)===request)intentRequests.delete(identity);};
  void request.then(release,release);
  return request;
 };
 if(onDemand)return{
  activate,isActive,restore,
  orderSource:(id:string|null)=>afterIntent('orderSource',()=>getFinanceOrderSourceContext(slug,id),id),
  lineNotes:(id:string|null)=>afterIntent('lineNotes',()=>getFinanceInvoiceLineNoteContext(slug,id),id),
  shippingCharge:(id:string|null)=>afterIntent('shippingCharge',()=>getFinanceInvoiceShippingChargeContext(slug,id),id),
  customFields:(id:string|null)=>afterIntent('customFields',()=>getFinanceInvoiceCustomFieldContext(slug,id),id),
  settings:()=>afterIntent('settings',()=>getFinanceInvoiceSettings(slug)),
  inventoryCatalog:async()=>({ok:true as const,data:[]}),
  issuer:()=>afterIntent('issuer',()=>companyInvoiceIssuerAction(slug)),
 };
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
  activate,isActive,restore,
  orderSource:(draftId:string|null)=>load(draftId).then(result=>result.orderSource),
  lineNotes:(draftId:string|null)=>load(draftId).then(result=>result.lineNotes),
  shippingCharge:(draftId:string|null)=>load(draftId).then(result=>result.shippingCharge),
  customFields:(draftId:string|null)=>load(draftId).then(result=>result.customFields),
  settings:()=>load(null).then(result=>result.settings),
  inventoryCatalog:()=>load(null).then(result=>result.inventoryCatalog),
  issuer:()=>load(null).then(result=>result.issuer),
 };
}
