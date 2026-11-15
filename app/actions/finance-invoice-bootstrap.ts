"use server";

import {getFinanceOrderSourceContext} from "@/app/actions/finance-order-sources";
import {getFinanceInvoiceLineNoteContext} from "@/app/actions/finance-invoice-line-notes";
import {getFinanceInvoiceShippingChargeContext} from "@/app/actions/finance-invoice-shipping-charge";
import {getFinanceInvoiceCustomFieldContext} from "@/app/actions/finance-invoice-custom-fields";
import {getFinanceInvoiceSettings} from "@/app/actions/finance-invoice-settings";
import {getInventorySalesCatalog} from "@/app/actions/finance-inventory-sales";
import {companyInvoiceIssuerAction} from "@/app/actions/finance-company-invoices";

/** Reuse each reader's authorization and validation within one server request. */
export async function getFinanceInvoiceBootstrap(slug:string,draftId:string|null=null){
 const[orderSource,lineNotes,shippingCharge,customFields,settings,inventoryCatalog,issuer]=await Promise.all([
  getFinanceOrderSourceContext(slug,draftId),
  getFinanceInvoiceLineNoteContext(slug,draftId),
  getFinanceInvoiceShippingChargeContext(slug,draftId),
  getFinanceInvoiceCustomFieldContext(slug,draftId),
  getFinanceInvoiceSettings(slug),
  getInventorySalesCatalog(slug),
  companyInvoiceIssuerAction(slug),
 ]);
 return{orderSource,lineNotes,shippingCharge,customFields,settings,inventoryCatalog,issuer};
}
