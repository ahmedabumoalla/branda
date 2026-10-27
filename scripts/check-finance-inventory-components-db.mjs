import { readFile } from 'node:fs/promises';
const baseline=await readFile('scripts/check-finance-control-report-db.mjs','utf8');
const tests=String.raw`
 {
 await login(owner);const scope=crypto.randomUUID(),p1=crypto.randomUUID(),p2=crypto.randomUUID();
 await db.query("INSERT INTO cafes(id,slug,name,owner_user_id) VALUES($1,'inventory-components','Inventory components',$2)",[scope,owner]);
 await db.query("INSERT INTO menu_products(id,cafe_id,name,price) VALUES($1,$3,'Drink A',20),($2,$3,'Drink B',30)",[p1,p2,scope]);
 let snapshot=await scalar('SELECT brand_finance_snapshot($1)',[scope]);const wh=snapshot.warehouses[0].id;
 const execute=(op,payload,request=crypto.randomUUID())=>run(op,payload,request,scope);
 const legacy=(await execute('item',{name:'Legacy ingredient',sku:'LEGACY',unit:'Legacy unit',menuProductId:p1})).id;
 await execute('stock_adjust',{itemId:legacy,warehouseId:wh,quantity:10,unitCost:3,note:'Initial stock'});
 const drawer=await scalar('SELECT brand_finance_private.cashier_drawer($1)',[scope]);
 const shift=(await execute('shift_open',{accountId:drawer,openingCash:0})).id;
 const sale=(qty=1,product=p1,request=crypto.randomUUID())=>execute('sale',{lines:[{productId:product,quantity:qty,expectedUnitPrice:product===p1?20:30}],warehouseId:wh,shiftId:shift,accountId:drawer,expectedTotal:qty*(product===p1?20:30),discount:0},request);
 const historical=await sale();
 const originalFinance=()=>scalar("SELECT md5(jsonb_build_object('documents',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM bf_documents d),'journal',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM bf_journal j),'movements',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM bf_movements m),'lines',(SELECT jsonb_agg(jsonb_build_object('id',id,'quantity',quantity,'cost',cost,'net',net,'tax',tax) ORDER BY id) FROM bf_document_lines))::text)");
 const before=await originalFinance(),warehouses=await scalar('SELECT count(*) FROM bf_warehouses');
 await db.exec(await readFile('supabase/migrations/20261026213958_brand_finance_shift_analytics.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261027090955_brand_finance_inventory_catalog_components.sql','utf8'));
 eq(await originalFinance(),before,'catalog migration preserves all posted financial amounts and movements');eq(await scalar('SELECT count(*) FROM bf_warehouses'),warehouses,'existing multiple warehouses retained');
 const catalog=()=>scalar('SELECT brand_finance_inventory_catalog($1)',[scope]);
 const unit=(name,request=crypto.randomUUID())=>scalar('SELECT brand_finance_inventory_unit_save($1,$2,$3)',[scope,name,request]);
 let cat=await catalog();const unitId=cat.units.find(x=>x.name==='جرام').id;
 eq(cat.items.find(x=>x.id===legacy).product_links,[{product_id:p1,quantity:1}],'legacy single product preserved as component');
 eq(cat.units.some(x=>x.name==='Legacy unit'),true,'existing unit labels preserved');
 const unitRequest=crypto.randomUUID(),customUnit=await unit('  Scoop  ',unitRequest);eq((await unit('  Scoop  ',unitRequest)).duplicate,true,'unit request replay');eq((await unit('Scoop')).id,customUnit.id,'unit trimmed duplicate reused');await fail(()=>unit('Different',unitRequest),'unit request conflict');
 await fail(()=>execute('warehouse',{name:'Extra warehouse'}),'second warehouse blocked by server');await catalog();await scalar('SELECT brand_finance_snapshot($1)',[scope]);eq(await scalar('SELECT count(*) FROM bf_warehouses WHERE cafe_id=$1',[scope]),1,'repeated initialization cannot add warehouses');
 const image=scope+'/'+crypto.randomUUID()+'.webp';
 const itemBody={name:'Shared ingredient',unitId,barcode:'000123',imagePath:image,costMode:'equal_split',productLinks:[{productId:p1,quantity:2},{productId:p2,quantity:1}],minQuantity:1};
 const itemRequest=crypto.randomUUID(),ingredient=(await execute('item',itemBody,itemRequest)).id;
 eq((await execute('item',itemBody,itemRequest)).duplicate,true,'item retry no second row');
 cat=await catalog();const saved=cat.items.find(x=>x.id===ingredient);eq([saved.barcode,saved.image_path,saved.cost_mode,saved.unit_id],['000123',image,'equal_split',unitId],'barcode zeros image unit and allocation preserved');
 eq(saved.product_links.length,2,'multiple menu links');eq(saved.cost_known,false,'new item cost unknown');
 await fail(()=>execute('item',{...itemBody,name:'Duplicate barcode'}),'barcode unique even separate sku');
 const code128=(await execute('item',{name:'Code128',unitId,barcode:'SKU-Ab.12/9_',productLinks:[]})).id;
 eq((await catalog()).items.find(i=>i.id===code128).barcode,'SKU-Ab.12/9_','manual alphanumeric barcode preserved');
 const generated=(await execute('item',{name:'Generated code',unitId,productLinks:[]}));eq(/^\d{6}$/.test(generated.barcode),true,'generated six digit string');
 // Force every random attempt to collide in this isolated database and exercise the bounded fallback
 const usedBarcodes=new Set((await catalog()).items.map(item=>item.barcode));
 if(!usedBarcodes.has('000000'))await execute('item',{name:'Reserved zero',unitId,barcode:'000000',productLinks:[]});
 usedBarcodes.add('000000');let nextFreeCode=1;while(usedBarcodes.has(String(nextFreeCode).padStart(6,'0')))nextFreeCode++;
 const executeDefinition=await scalar("SELECT pg_get_functiondef('public.brand_finance_execute(uuid,text,jsonb,uuid)'::regprocedure)");
 eq(executeDefinition.includes('floor(random()*1000000)'),true,'random generation fixture anchor');
 await db.exec(executeDefinition.replace('floor(random()*1000000)','0'));
 try {const fallback=await execute('item',{name:'Collision fallback',unitId,productLinks:[]});eq(fallback.barcode,String(nextFreeCode).padStart(6,'0'),'32 collisions choose first unused indexed gap');} finally {await db.exec(executeDefinition);}
 await fail(()=>execute('item',{...itemBody,barcode:'bad space'}),'invalid barcode blocked');
 await fail(()=>execute('item',{...itemBody,barcode:'X'.repeat(65)}),'barcode length bounded');
 await fail(()=>execute('item',{...itemBody,barcode:'UNIQUE',imagePath:cafe+'/'+crypto.randomUUID()+'.webp'}),'cross tenant image blocked');
 await fail(()=>execute('item',{...itemBody,barcode:'UNIQUE',imagePath:'https://example.test/x.webp'}),'external image URL blocked');
 await fail(()=>execute('item',{...itemBody,barcode:'UNIQUE',unitId:crypto.randomUUID()}),'foreign unit denied');
 await fail(()=>execute('item',{...itemBody,barcode:'UNIQUE',productLinks:[{productId:product,quantity:1}]}),'foreign product denied');
 await fail(()=>execute('item',{...itemBody,barcode:'UNIQUE',productLinks:[{productId:p1,quantity:1},{productId:p1,quantity:2}]}),'duplicate link rejected');
 await fail(()=>execute('item',{...itemBody,barcode:'UNIQUE',productLinks:[{productId:p1,quantity:.0001}]}),'consumption precision bounded');
 await execute('stock_adjust',{itemId:ingredient,warehouseId:wh,quantity:10,unitCost:4,note:'Stock at known cost'});
 await fail(()=>execute('item',{...itemBody,id:ingredient,unitId:customUnit.id}),'used stock unit cannot change');
 const stock=(item)=>scalar('SELECT to_jsonb(s) FROM bf_stock s WHERE cafe_id=$1 AND item_id=$2 AND warehouse_id=$3',[scope,item,wh]);
 const tracked=await sale(2),line=await scalar('SELECT to_jsonb(l) FROM bf_document_lines l WHERE document_id=$1',[tracked.id]);
 eq([line.cost,line.allocated_cost,line.cost_status],[22,14,'known'],'actual COGS22 and allocated14 remain separate');
 eq([Number((await stock(legacy)).quantity),Number((await stock(ingredient)).quantity)],[7,6],'each linked component deducted by product quantity');
 eq(await scalar('SELECT count(*) FROM bf_line_components WHERE line_id=$1',[line.id]),2,'immutable component snapshot per sold line');
 const cogs=()=>scalar("SELECT coalesce(sum(j.debit-j.credit),0) FROM bf_journal j JOIN bf_accounts a ON a.id=j.account_id WHERE j.cafe_id=$1 AND a.code='5000'",[scope]);
 eq(Number(await cogs()),25,'actual inventory cost posted including historical sale');
 const ledgerInventory=()=>scalar("SELECT coalesce(sum(j.debit-j.credit),0) FROM bf_journal j JOIN bf_accounts a ON a.id=j.account_id WHERE j.cafe_id=$1 AND a.code='1200'",[scope]);
 const stockValue=()=>scalar('SELECT coalesce(sum(value),0) FROM bf_stock WHERE cafe_id=$1',[scope]);
 eq(await ledgerInventory(),await stockValue(),'GL inventory matches stock valuation after multiple components');
 snapshot=await scalar('SELECT brand_finance_snapshot($1)',[scope]);const prod=snapshot.products.find(p=>p.id===p1);eq(prod.stock_components.length,2,'POS snapshot exposes all consumption components');eq(prod.quantity,3,'product availability uses limiting component');
 const analytics=await scalar('SELECT brand_finance_shift_analytics($1,$2)',[scope,shift]);eq([analytics.totals.cost,analytics.totals.allocatedCost],[25,17],'shift report distinguishes actual and allocated cost');eq(analytics.products.find(p=>p.productId===p1).stock.length,2,'shift stock detail includes every component');
 await execute('item',{...itemBody,id:ingredient,productLinks:[{productId:p2,quantity:9}],costMode:'full'});
 await execute('item',{name:'Legacy changed',id:legacy,unit:'Legacy unit',menuProductId:''});
 const refund=async(doc,lineId,quantity,total)=>{const req=await execute('refund',{documentId:doc,lines:[{lineId,quantity}],expectedTotal:total,expectedPaid:total,paymentMethod:'cash',accountId:drawer,shiftId:shift,note:'Return'});return execute('refund_approve',{requestId:req.id});};
 await refund(tracked.id,line.id,1,20);
 eq([Number((await stock(legacy)).quantity),Number((await stock(ingredient)).quantity)],[8,8],'partial refund restores original components after link edits');
 const returned=await scalar('SELECT to_jsonb(l) FROM bf_document_lines l WHERE reference_line_id=$1',[line.id]);eq([returned.cost,returned.allocated_cost],[11,7],'partial refund preserves original cost allocation');
 await refund(tracked.id,line.id,1,20);eq([Number((await stock(legacy)).quantity),Number((await stock(ingredient)).quantity)],[9,10],'complete refund restores exact original quantities');
 eq(await ledgerInventory(),await stockValue(),'refund inventory/GL reconcile');
 await fail(()=>refund(tracked.id,line.id,1,20),'over-refund denied');
 const historicalLine=await scalar('SELECT id FROM bf_document_lines WHERE document_id=$1',[historical.id]);await refund(historical.id,historicalLine,1,20);eq(Number((await stock(legacy)).quantity),10,'pre-component historical refund remains supported');
 // Sell into shortage; provenance and actual-vs-allocated accounting stay distinct
 const negative=await sale(2,p2);const negativeLine=await scalar('SELECT to_jsonb(l) FROM bf_document_lines l WHERE document_id=$1',[negative.id]);eq([Number((await stock(ingredient)).quantity),negativeLine.cost_status,negativeLine.cost,negativeLine.allocated_cost],[-8,'estimated',72,72],'full allocation and negative sale stay valid');
 eq(await ledgerInventory(),await stockValue(),'negative inventory balances ledger');
 await refund(negative.id,negativeLine.id,2,60);eq(Number((await stock(ingredient)).quantity),10,'negative sale refund returns original quantity');
 const unknown=(await execute('item',{name:'Unknown component',unitId,productLinks:[{productId:p1,quantity:1}]})).id;
 const unknownSale=await sale();eq((await scalar('SELECT to_jsonb(l) FROM bf_document_lines l WHERE document_id=$1',[unknownSale.id])).cost_status,'unknown','zero stock unknown component cannot invent known cost');
 const knownZero=(await execute('item',{name:'Known zero',unitId,productLinks:[{productId:p2,quantity:1}]})).id;
 await execute('stock_adjust',{itemId:knownZero,warehouseId:wh,quantity:2,unitCost:0,note:'Known zero basis'});eq((await catalog()).items.find(i=>i.id===knownZero).cost_known,true,'real zero purchase basis distinguished');
 const mixedProduct=crypto.randomUUID();await db.query("INSERT INTO menu_products(id,cafe_id,name,price) VALUES($1,$2,'Mixed provenance',7)",[mixedProduct,scope]);
 const mixedItems=[];for(const name of ['Mixed A','Mixed B'])mixedItems.push((await execute('item',{name,unitId,productLinks:[{productId:mixedProduct,quantity:1}]})).id);mixedItems.sort();
 await execute('stock_adjust',{itemId:mixedItems[0],warehouseId:wh,quantity:2,unitCost:5,note:'Known first component'});
 const mixedSale=await execute('sale',{lines:[{productId:mixedProduct,quantity:1,expectedUnitPrice:7}],warehouseId:wh,shiftId:shift,accountId:drawer,expectedTotal:7});
 const mixedLine=await scalar('SELECT to_jsonb(l) FROM bf_document_lines l WHERE document_id=$1',[mixedSale.id]);eq([mixedLine.item_id,mixedLine.cost_status],[mixedItems[0],'unknown'],'aggregate unknown status with known first component');
 await refund(mixedSale.id,mixedLine.id,1,7);
 eq([(await stock(mixedItems[0])).cost_known,(await stock(mixedItems[1])).cost_known],[true,false],'refund preserves each component provenance rather than poisoning known component with aggregate unknown');
 // Tiny physical components return cumulative quantities/cost without roundoff loss
 const tinyProduct=crypto.randomUUID();await db.query("INSERT INTO menu_products(id,cafe_id,name,price) VALUES($1,$2,'Tiny',1)",[tinyProduct,scope]);
 const tiny=(await execute('item',{name:'Tiny stock',unitId,productLinks:[{productId:tinyProduct,quantity:.001}]})).id;
 await execute('stock_adjust',{itemId:tiny,warehouseId:wh,quantity:1,unitCost:10,note:'Tiny initial'});
 const tinySale=await execute('sale',{lines:[{productId:tinyProduct,quantity:1,expectedUnitPrice:1}],warehouseId:wh,shiftId:shift,accountId:drawer,expectedTotal:1});
 const tinyLine=await scalar('SELECT id FROM bf_document_lines WHERE document_id=$1',[tinySale.id]);
 await refund(tinySale.id,tinyLine,.333,.33);await refund(tinySale.id,tinyLine,.333,.34);await refund(tinySale.id,tinyLine,.334,.33);
 eq(Number((await stock(tiny)).quantity),1,'fractional component refunds restore exact stock');eq(await ledgerInventory(),await stockValue(),'fractional cost return reconciles');
 await fail(()=>db.query('DELETE FROM bf_line_components WHERE line_id=$1',[line.id]),'component snapshots immutable');
 for(const job of ['cashier','auditor','accountant','warehouse','manager']){
  await login(owner);await execute('staff',{email:'staff@example.test',name:'Inventory role',role:job,active:true});await login(staff);
  if(['warehouse','manager'].includes(job)){await unit('Role '+job);await execute('item',{name:'Role '+job,unitId,productLinks:[]});checks++;}
  else{await fail(()=>unit('Denied '+job),job+' unit write denied');await fail(()=>execute('item',{name:'Denied',unitId}),job+' item write denied');}
  if(job==='cashier')await fail(()=>catalog(),'cashier private catalog denied');else eq(Array.isArray((await catalog()).items),true,job+' catalog read');
 }
 await login(owner);await db.exec('SET ROLE authenticated');await fail(()=>db.query('SELECT * FROM bf_line_components'),'direct component data denied');await fail(()=>db.query('SELECT * FROM bf_item_units'),'direct units denied');await db.exec('RESET ROLE');
 await login(outsider);await fail(()=>catalog(),'cross-brand catalog denied');await fail(()=>unit('Foreign'),'cross-brand unit denied');await login(owner);
 eq(await scalar('SELECT count(*) FROM (SELECT document_id FROM bf_journal GROUP BY document_id HAVING sum(debit)<>sum(credit)) q'),0,'all generated journals balanced');
 eq(await scalar("SELECT polpermissive FROM pg_policy WHERE polname='bf_inventory_images_server_only'"),false,'inventory image policy restrictive');
 console.log('Inventory catalogue/components SQL: '+checks+' checks passed including accounting baseline');
 }
`;
const anchor="console.log('Financial controls SQL: '+checks+' checks passed including period/supplier/custody baseline');";
if(!baseline.includes(anchor))throw Error('Control fixture anchor missing');
await import('data:text/javascript;base64,'+Buffer.from(baseline.replace(anchor,()=>tests)).toString('base64'));
