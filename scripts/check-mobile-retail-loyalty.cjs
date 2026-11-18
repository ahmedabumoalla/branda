const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file,stubs={},cache=new Map()){
  if(cache.has(file))return cache.get(file);
  const result={};cache.set(file,result);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function('require','exports',code)(n=>{
    if(n in stubs)return stubs[n];if(n==='server-only')return{};if(n.endsWith('.css'))return new Proxy({},{get:(_,k)=>String(k)});
    if(n.startsWith('@/')||n.startsWith('.')){const base=n.startsWith('@/')?n.slice(2):path.join(path.dirname(file),n);const target=['.ts','.tsx'].map(e=>base+e).find(f=>fs.existsSync(f));if(!target)throw Error('Missing '+n);return load(target,stubs,cache);}
    return require(n);
  },result);return result;
}
const slug='brand-434aab1976d5';let checks=0;const check=(v,m)=>{assert(v,m);checks++;};
const styles=load('lib/loyalty/stamp-style.ts'),profile=load('lib/loyalty/brand-stamp-artwork.ts');
for(const old of [undefined,'ceramic','paper','meal','unknown'])check(profile.brandStampStyle(slug,old)==='phone','legacy default becomes a phone');
for(const value of ['phone','sim','headphones','brand'])check(profile.brandStampStyle(slug,value)===value,'explicit telecom/logo choice retained');
check(profile.brandStampStyle('another-brand','ceramic')==='ceramic','other brand default unchanged');
check(profile.brandStampStyle('brand-1c2b6f7e028f','meal')==='shirt','Fawasel unchanged');
check(profile.brandStampStyle('brand-871ec6e243c0','ceramic')==='plant','Together unchanged');
const program={enabled:true,cardTitle:'Fixture loyalty',cardSubtitle:'Fixture visits',purchasesRequired:7,rewardProductId:null,rewardName:'Fixture reward',stampLabel:'Stamp',terms:'',cardBackground:'#123456',cardForeground:'#ffffff',cardAccent:'#abcdef',appleWalletEnabled:true,googleWalletEnabled:true,stampStyle:'phone',cardDesign:{keep:true}};
const experience={rewardValidityDays:365,rewardKind:'custom',rewardDiscountPercent:null,nearbyMessage:'Fixture nearby',latitude:null,longitude:null,offerTitle:'',offerBody:''};
const identity={slug,name:'Fixture telecom',nameEn:'Fixture',businessCategory:'cafes_coffee',logoUrl:null};
const blank=()=>null;
const dashboard=load('components/rast-loyalty/rast-dashboard.tsx',{
  'next/navigation':{useRouter:()=>({refresh(){}})},'next/link':({href,children})=>React.createElement('a',{href},children),
  '@/app/actions/loyalty-experience':{},'@/components/loyalty/customer-directory':{LoyaltyCustomerDirectory:blank},'@/components/loyalty/wallet-message-history':{WalletMessageHistory:blank},
  './rast-brand':{RastBrand:blank},'./qr-code':{RastQrCode:blank},'./rast-stamp-card':{RastStampCard:blank},
});
for(const logoUrl of [null,'https://fixture.test/uploaded-logo.png']){
  const html=renderToStaticMarkup(React.createElement(dashboard.RastLoyaltyDashboard,{identity:{...identity,logoUrl},initialDashboard:{program},initialExperience:experience,signupUrl:'https://example.test',walletAvailability:{apple:true,google:true},view:'rewards'}));
  const select=html.match(/<select[^>]*>[\s\S]*?<option value="phone"[\s\S]*?<\/select>/)?.[0];check(select,'telecom selector rendered');
  for(const key of ['phone','sim','headphones','brand'])check(select.includes('value="'+key+'"'),'expected choice visible');
  check(!select.includes('value="ceramic"')&&!select.includes('value="meal"'),'no food choices for telecom');
  const option=select.match(/<option[^>]*value="brand"[^>]*>/)[0];check(option.includes('disabled')===!logoUrl,'brand logo activates only with saved logo');
  if(!logoUrl)check(html.includes('href="/dashboard/settings"'),'upload settings shortcut');
}
const glyph=load('components/rast-loyalty/stamp-glyph.tsx',{'next/image':p=>React.createElement('img',p)});
const art=load('lib/wallet/art.ts');
const member={cafeSlug:slug,cafeName:'Fixture',card:{id:'11111111-1111-4111-8111-111111111111',stampsInCycle:2,updatedAt:'2026-11-19'},program,experience};
for(const style of ['phone','sim','headphones']){
 const html=renderToStaticMarkup(React.createElement(glyph.StampGlyph,{style}));check(html.includes(styles.stampPaths[style]),'web uses shared icon');
 const svg=art.walletStampSvg({...member,program:{...program,stampStyle:style}});check(svg.includes(styles.stampPaths[style]),'wallet uses same outline');
 check(!svg.includes('undefined'),'valid wallet artwork');
}
const logo='data:image/png;base64,fixture';check(art.walletStampSvg({...member,program:{...program,stampStyle:'brand'}},2,false,logo).includes(logo),'wallet embeds selected brand logo');
let permitted=true,rpcs=[];
const service=load('lib/data/loyalty-experience.ts',{
 '@/lib/data/cafes':{requireOwnerCafeContext:async()=>{if(!permitted)throw Error('Forbidden');return{id:'11111111-1111-4111-8111-111111111111'};}},
 '@/lib/data/feature-entitlements':{getOwnerFeatureCodes:async()=>['loyalty']},
 '@/lib/supabase/server':{createClient:async()=>({rpc:async(name,args)=>{rpcs.push({name,args});return{error:null};}})},
 '@/lib/supabase/admin':{createAdminClient:()=>{throw Error('Unexpected privileged query');}},
});
(async()=>{
 for(const stampStyle of ['phone','sim','headphones','brand']){await service.saveBrandLoyaltyProgram({program:{...program,stampStyle},experience});const call=rpcs.at(-1);check(call.name==='set_rast_loyalty_settings','existing authorized save RPC');check(call.args.p_program.cardDesign.stampStyle===stampStyle&&call.args.p_program.cardDesign.keep===true,'save preserves choice and other design data');}
 const before=rpcs.length;await assert.rejects(()=>service.saveBrandLoyaltyProgram({program:{...program,stampStyle:'invalid'},experience}));check(rpcs.length===before,'invalid style never persists');
 permitted=false;await assert.rejects(()=>service.saveBrandLoyaltyProgram({program,experience}),/Forbidden/);check(rpcs.length===before,'unauthorized save blocked');
 console.log('PASS '+checks+' telecom stamp, logo availability, native artwork and authorized save checks; no live writes');
})().catch(e=>{console.error(e);process.exitCode=1;});
