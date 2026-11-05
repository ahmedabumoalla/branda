// Read-only SQL preparation. Full scoped catalog backup stays in ignored output.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir='output/dabab-refresh',cafe='3813425d-db13-4d30-8b82-9d41aad12e36';
const schema=JSON.parse(fs.readFileSync(`${dir}/schema.json`,'utf8').replace(/^\uFEFF/,'')).rows[0].inspection;
const refs=schema.foreignKeys.map(f=>{
 const match=f.definition.match(/^FOREIGN KEY \((\w+)\) REFERENCES (\w+)\(id\)/);assert(match);assert(/^\w+$/.test(f.table));
 return `'${f.name}',(SELECT count(*) FROM public.${f.table} r JOIN public.${match[2]} p ON r.${match[1]}=p.id WHERE p.cafe_id='${cafe}')`;
});
const sql=`SELECT jsonb_build_object('foreignReferences',jsonb_build_object(${refs.join(',')}),
 'products',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.menu_products p WHERE cafe_id='${cafe}'),
 'categories',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.menu_categories c WHERE cafe_id='${cafe}'),
 'hashes',jsonb_build_object('products',(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id)::text,'')) FROM public.menu_products p WHERE cafe_id='${cafe}'),
 'categories',(SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id)::text,'')) FROM public.menu_categories c WHERE cafe_id='${cafe}')),
 'settings',(SELECT jsonb_build_object('logo_storage_path',logo_storage_path,'logo_url',logo_url) FROM public.cafe_settings WHERE cafe_id='${cafe}'),
 'identity',(SELECT to_jsonb(c) FROM public.cafe_custom_identity c WHERE cafe_id='${cafe}'),
 'program',(SELECT to_jsonb(p) FROM public.cafe_loyalty_programs p WHERE cafe_id='${cafe}'),
 'experience',(SELECT to_jsonb(e) FROM public.cafe_loyalty_experience e WHERE cafe_id='${cafe}'),
 'counts',jsonb_build_object('customers',(SELECT count(*) FROM public.customer_profiles WHERE cafe_id='${cafe}'),'cards',(SELECT count(*) FROM public.loyalty_cards WHERE cafe_id='${cafe}'),
 'orders',(SELECT count(*) FROM public.orders WHERE cafe_id='${cafe}'))
 ) AS backup;`;
fs.writeFileSync(`${dir}/backup.sql`,sql);
console.log(JSON.stringify({prepared:true,foreignKeys:refs.length}));
