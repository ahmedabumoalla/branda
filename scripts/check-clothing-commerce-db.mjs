import { readFile } from 'node:fs/promises';

// Exercise the exact existing accounting/stock/RLS suite with a clothing tenant.
// PGlite is isolated and never touches customer data or sends messages.
let baseline = await readFile('scripts/check-gift-commerce-db.mjs', 'utf8');
const migration = 'supabase/migrations/20261114024408_clothing_store_commerce.sql';
const anchor = "await db.exec(await readFile('supabase/migrations/20261031235252_gift_commerce_orders_and_finance.sql','utf8'));";
if (!baseline.includes(anchor)) throw new Error('Commerce fixture anchor missing');
const setup = String.raw`
 await db.exec("CREATE FUNCTION public.storage_cafe_is_public(uuid) RETURNS boolean LANGUAGE sql AS $storagefixture$ SELECT EXISTS(SELECT 1 FROM public.cafes WHERE id=$1 AND status IN('active','published') AND deleted_at IS NULL) $storagefixture$; ALTER TABLE public.menu_products ADD COLUMN available_for_pickup boolean DEFAULT true;");
 const storageSource=await readFile('supabase/migrations/20261101001101_gift_catalog_public_image_access.sql','utf8');
 await db.exec(storageSource.slice(storageSource.indexOf('CREATE OR REPLACE FUNCTION'),storageSource.lastIndexOf('COMMIT;')));
 await db.exec(await readFile('${migration}','utf8'));
`;
baseline = baseline.replace(anchor, () => anchor + setup);
if (!baseline.includes("'gifts_flowers')\",[tenant,owner])")) throw new Error('Commerce tenant fixture anchor missing');
baseline = baseline.replace("'gifts_flowers')\",[tenant,owner])", "'clothing_stores')\",[tenant,owner])");
const end = "console.log('Gift commerce SQL: '+checks+' checks passed including accounting baseline');";
const additional = String.raw`
 const shirt=crypto.randomUUID();
 await db.query("INSERT INTO menu_products(id,cafe_id,name,price,commerce_details) VALUES($1,$2,'Shirt',70,$3)",[shirt,tenant,{options:[{id:'m-black',label:'M / Black',price:75,available:true,stock:1},{id:'l-black',label:'L / Black',price:80,available:true,stock:0},{id:'s-white',label:'S / White',price:70,available:false,stock:5}]}]);
 const variant=(optionId,quantity=1)=>({productId:shirt,quantity,selections:[],optionId});
 await fail(()=>checkout(body([variant(undefined)],100)),'clothing variant selection required');
 await fail(()=>checkout(body([variant('unknown')],100)),'unknown clothing variant rejected');
 await fail(()=>checkout(body([variant('l-black')],105)),'out-of-stock size rejected');
 await fail(()=>checkout(body([variant('s-white')],95)),'unavailable color rejected');
 const shirtOrder=await checkout(body([variant('m-black')],100));
 eq(shirtOrder.total,100,'selected size price and shipping calculated on server');
 await fail(()=>checkout(body([variant('m-black')],100)),'size reservation prevents overselling');
 await command(shirtOrder.id,'cancel',{note:'Customer cancelled'});
 const reordered=await checkout(body([variant('m-black')],100));
 eq(reordered.status,'pending','cancellation releases reserved size');
 eq(await scalar('SELECT public.storage_menu_product_is_public($1,$2)',[tenant,soldout]),true,'sold-out clothing photo remains public');
 eq(await scalar('SELECT public.storage_menu_product_is_public($1,$2)',[tenant,product]),false,'foreign product photo denied');
 await login(outsider);eq(await scalar('SELECT gift_commerce_private.can_manage($1)',[tenant]),false,'clothing outsider denied');await login(owner);
 await db.query("UPDATE cafes SET business_category='cafes_coffee' WHERE id=$1",[tenant]);
 eq(await cfg(),null,'non-commerce category denied');
 eq(await scalar('SELECT gift_commerce_private.can_manage($1)',[tenant]),false,'non-commerce owner denied');
 await db.query("UPDATE cafes SET business_category='gifts_flowers' WHERE id=$1",[tenant]);
 eq(Boolean(await cfg()),true,'existing gift category remains supported');
 eq(await scalar('SELECT gift_commerce_private.can_manage($1)',[tenant]),true,'existing gift owner remains authorized');
 await db.query("UPDATE cafes SET business_category='clothing_stores',enabled=false WHERE id=$1",[tenant]);
 eq(await cfg(),null,'disabled clothing service denied');
 eq(await scalar('SELECT gift_commerce_private.can_manage($1)',[tenant]),false,'disabled clothing management denied');
 eq(await scalar("SELECT has_function_privilege('anon','public.gift_store_config(text)','execute')"),false,'config anon privilege denied');
 eq(await scalar("SELECT has_function_privilege('authenticated','public.gift_store_config(text)','execute')"),false,'config authenticated privilege denied');
 eq(await scalar("SELECT has_function_privilege('service_role','public.gift_store_config(text)','execute')"),true,'config service privilege retained');
 console.log('Clothing commerce SQL: '+checks+' checks passed including accounting baseline');
`;
if (!baseline.includes(end)) throw new Error('Commerce report fixture anchor missing');
baseline = baseline.replace(end, () => additional);
await import('data:text/javascript;base64,' + Buffer.from(baseline).toString('base64'));

