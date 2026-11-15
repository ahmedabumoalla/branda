type PurchaseUnit={itemId:string;name:string;factor:number};

/** Prices are per selected unit; quantities and tracking remain in their existing fields. */
export function convertPurchaseUnitPrice(price:number,itemId:string,fromUnit:string,toUnit:string,units:readonly PurchaseUnit[]):number{
  if(fromUnit===toUnit||!Number.isFinite(price))return price;
  const from=units.find(unit=>unit.itemId===itemId&&unit.name===fromUnit)?.factor;
  const to=units.find(unit=>unit.itemId===itemId&&unit.name===toUnit)?.factor;
  if(from===undefined||to===undefined||!Number.isFinite(from)||!Number.isFinite(to)||from<=0||to<=0)return price;
  // Unit prices can be fractional; round monetary line totals, never intermediate conversions.
  return price*(to/from);
}
