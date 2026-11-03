const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
require('@next/env').loadEnvConfig(process.cwd());
const {createClient}=require('@supabase/supabase-js');
const source=JSON.parse(fs.readFileSync('data/imports/five-restaurants-source-20261103.json','utf8'));
assert.equal(source.brands.length,5);
const targets=source.brands.map(b=>[b.cafeId,b.slug]);
function load(file){const exported={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{if(name==='server-only')return {};if(name==='@/lib/loyalty/secure-qr-payload')return {createBarndaksaQrPayload(){throw Error('Customer pass creation forbidden in this check')}};return require(name)},exported);return exported;}
(async()=>{
const config=load('lib/wallet/config.ts'),readiness=config.getWalletReadiness();assert(readiness.apple&&readiness.google,'Wallet credentials not ready');
const {issuerId,email,key,baseUrl}=config.googleConfig(),payload=load('lib/wallet/payload.ts');
const now=Math.floor(Date.now()/1000),input=[{alg:'RS256',typ:'JWT'},{iss:email,scope:'https://www.googleapis.com/auth/wallet_object.issuer',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
const assertion=input+'.'+crypto.sign('RSA-SHA256',Buffer.from(input),key).toString('base64url');
const auth=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(20000)});assert.equal(auth.status,200);const {access_token}=await auth.json();
const base='https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass',headers={Authorization:'Bearer '+access_token,'Content-Type':'application/json'},activate=process.argv.includes('--activate');
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},realtime:{transport:require("next/dist/compiled/ws")}}),rows=[];
async function read(q){const {data,error}=await q;if(error)throw Error(error.message);return data;}
for(const [id,slug]of targets){
const cafe=await read(admin.from('cafes').select('name,slug,is_public,status').eq('id',id).single());assert.equal(cafe.slug,slug);assert.equal(cafe.status,'active');
const path=base+'/'+encodeURIComponent(payload.googleClassId(issuerId,id)),current=await fetch(path,{headers,signal:AbortSignal.timeout(20000)});assert([200,404].includes(current.status),'Google class read failed '+current.status);let result=current.status===200?await current.json():null;
if(result)assert.equal(result.localizedIssuerName?.defaultValue?.value||result.issuerName,cafe.name);
let changed=false,logoHttp=null;
if(activate){
const verified=JSON.parse(fs.readFileSync('output/five-restaurants/import-verification.json','utf8'));assert.equal(verified.result,'PASS','Verify imported database and assets before activating wallet classes');assert(verified.brands.some(b=>b.cafeId===id&&b.slug===slug));assert.equal(verified.files.find(f=>f.file==='data/imports/five-restaurants-source-20261103.json')?.sha256,crypto.createHash('sha256').update(fs.readFileSync('data/imports/five-restaurants-source-20261103.json')).digest('hex'),'Source changed since database verification');
const program=await read(admin.from('cafe_loyalty_programs').select('enabled,purchases_required,google_wallet_enabled,apple_wallet_enabled,card_title,reward_name,terms,card_background,card_foreground,card_accent').eq('cafe_id',id).single());assert(program.enabled&&program.google_wallet_enabled&&program.apple_wallet_enabled);assert.equal(program.purchases_required,6);
const experience=await read(admin.from('cafe_loyalty_experience').select('reward_kind,reward_discount_percent,nearby_message,branch_latitude,branch_longitude').eq('cafe_id',id).single());assert.equal(experience.reward_kind,'discount');assert.equal(experience.reward_discount_percent,10);
const body=payload.buildGoogleClass({cafeName:cafe.name,cafeSlug:cafe.slug,card:{cafeId:id},program:{cardTitle:program.card_title,rewardName:program.reward_name,terms:program.terms,cardBackground:program.card_background,cardForeground:program.card_foreground,cardAccent:program.card_accent},experience:{nearbyMessage:experience.nearby_message,latitude:experience.branch_latitude,longitude:experience.branch_longitude}},issuerId,baseUrl);
const logo=await fetch(body.programLogo.sourceUri.uri,{signal:AbortSignal.timeout(30000)});assert.equal(logo.status,200);assert(logo.headers.get('content-type')?.startsWith('image/'));logoHttp=logo.status;
const write=await fetch(result?path:base,{method:result?'PATCH':'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});assert(write.ok,'Google class activation failed '+write.status);result=await write.json();changed=true;
}
rows.push({name:cafe.name,slug:cafe.slug,public:cafe.is_public,readStatus:current.status,changed,reviewStatus:result?.reviewStatus||null,logoHttp});
}
const report={at:new Date().toISOString(),mode:activate?'activate classes':'read-only',readiness,googleAuth:200,classes:rows,customerPassesCreated:0,messagesSent:0};fs.writeFileSync('output/five-restaurants/loyalty-wallet-'+(activate?'activation':'readiness')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exitCode=1});
