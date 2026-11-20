// Star and check stamps for every brand, plus the single-colour logo stamp rendition.
// Isolated: synthetic images only, no database, storage, provider or network calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),sharp=require('sharp');
process.env.WALLET_PUBLIC_BASE_URL='https://wallet.example.test';process.env.WALLET_AUTH_SECRET='fixture-only-'.padEnd(40,'x');
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
let checks=0;const check=(v,m)=>{assert(v,m);checks++;};
const styles=load('lib/loyalty/stamp-style.ts'),profile=load('lib/loyalty/brand-stamp-artwork.ts');
const brands={generic:'another-brand',tea:'brand-26e0f82cdbcf',telecom:'brand-434aab1976d5',fawasel:'brand-1c2b6f7e028f',together:'brand-871ec6e243c0'};

for(const style of ['star','check']){
  check(styles.stampStyles.includes(style)&&styles.stampPaths[style],style+' is a shared stamp outline');
  check(styles.loyaltyStampStyle(style)===style,style+' survives validation');
  for(const [name,slug] of Object.entries(brands))check(profile.brandStampStyle(slug,style)===style,style+' is kept for '+name);
}
for(const slug of Object.values(brands))check(profile.brandStampStyle(slug,'brand')==='brand','logo choice kept');
check(profile.brandStampStyle(brands.telecom,'ceramic')==='phone'&&profile.brandStampStyle(brands.fawasel,'meal')==='shirt'&&profile.brandStampStyle(brands.together,'paper')==='plant'&&profile.brandStampStyle(brands.generic,'paper')==='paper','brand defaults unchanged');
check(styles.loyaltyStampStyle('unknown')==='ceramic','unknown values still fall back');
check(styles.stampLogoUrl('brand-1')==='/api/wallet/brand/brand-1/logo?shape=stamp&v='+styles.STAMP_LOGO_VERSION,'stamp logo address');
check(styles.stampLogoUrl('brand-1','b 1').endsWith('&branch=b%201')&&styles.stampLogoUrl('')===null&&styles.stampLogoUrl('a/b')===null,'branch kept and unsafe slugs refused');

// Saved programs: a salon keeps star, check and logo instead of being reset to scissors.
const cards=load('lib/data/loyalty-cards.ts',{'@/lib/supabase/server':{},'@/lib/supabase/admin':{},'@/lib/data/cafes':{},'@/lib/data/loyalty-identity':{},'@/lib/data/feature-entitlements':{},'@/lib/auth/rast-loyalty-session':{}});
const appearance=category=>({autoLogo:false,businessCategory:category,colors:{background:'#123456',foreground:'#ffffff',accent:'#abcdef'},logoPath:null,logoUrl:null});
for(const style of ['star','check','brand','comb'])check(cards.mapLoyaltyProgramSnapshot({card_design:{stampStyle:style}},'salon-brand',appearance('hair_salons')).stampStyle===style,'salon keeps '+style);
check(cards.mapLoyaltyProgramSnapshot({card_design:{stampStyle:'meal'}},'salon-brand',appearance('hair_salons')).stampStyle==='scissors','salon default unchanged');
for(const style of ['star','check'])check(cards.mapLoyaltyProgramSnapshot({card_design:{stampStyle:style}},brands.generic,appearance('cafes_coffee')).stampStyle===style,'cafe keeps '+style);

// Picker: every brand sees both new shapes beside its own, before the logo choice.
const program={enabled:true,cardTitle:'Fixture loyalty',cardSubtitle:'Fixture visits',purchasesRequired:7,rewardProductId:null,rewardName:'Fixture reward',stampLabel:'Stamp',terms:'',cardBackground:'#123456',cardForeground:'#ffffff',cardAccent:'#abcdef',appleWalletEnabled:true,googleWalletEnabled:true,stampStyle:'star',cardDesign:{keep:true}};
const experience={rewardValidityDays:365,rewardKind:'custom',rewardDiscountPercent:null,nearbyMessage:'Fixture nearby',latitude:null,longitude:null,offerTitle:'',offerBody:''};
const blank=()=>null;
const dashboard=load('components/rast-loyalty/rast-dashboard.tsx',{
  'next/navigation':{useRouter:()=>({refresh(){}})},'next/link':({href,children})=>React.createElement('a',{href},children),
  '@/app/actions/loyalty-experience':{},'@/components/loyalty/customer-directory':{LoyaltyCustomerDirectory:blank},'@/components/loyalty/wallet-message-history':{WalletMessageHistory:blank},
  './rast-brand':{RastBrand:blank},'./qr-code':{RastQrCode:blank},'./rast-stamp-card':{RastStampCard:blank},
});
const own={generic:['ceramic','paper','meal'],salon:['scissors','comb'],tea:['tea'],telecom:['phone','sim','headphones'],fawasel:['shirt'],together:['plant']};
for(const [name,expected] of Object.entries(own))for(const logoUrl of [null,'https://fixture.test/uploaded-logo.png']){
  const identity={slug:name==='salon'?'salon-brand':brands[name],name:'Fixture',nameEn:'Fixture',businessCategory:name==='salon'?'hair_salons':'cafes_coffee',logoUrl};
  const html=renderToStaticMarkup(React.createElement(dashboard.RastLoyaltyDashboard,{identity,initialDashboard:{program},initialExperience:experience,signupUrl:'https://example.test',walletAvailability:{apple:true,google:true},view:'rewards'}));
  const select=html.match(/<select[^>]*>(?:(?!<\/select>)[\s\S])*value="star"[\s\S]*?<\/select>/)?.[0];check(select,name+' picker rendered');
  const values=[...select.matchAll(/<option[^>]*value="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(values,[...expected,'star','check','brand'],name+' keeps its shapes and gains star and check');checks++;
  check(/<option[^>]*value="star"[^>]*selected/.test(select),name+' shows the saved star choice');
  check(select.match(/<option[^>]*value="brand"[^>]*>/)[0].includes('disabled')===!logoUrl,'logo choice follows the saved logo');
  check(html.includes('href="/dashboard/settings"')===!logoUrl,'missing logo points to brand settings');
}

// Card: star and check use the shared outline, the logo is a mask in the stamp colour.
const image=({unoptimized,priority,...p})=>React.createElement('img',p);
const ui={'next/image':image,'next/link':({href,children})=>React.createElement('a',{href},children),'./rast-brand':{RastBrand:blank},'./qr-code':{RastQrCode:blank},'@/components/rast-loyalty/qr-code':{RastQrCode:blank},'./fawasel-brand-mark':{FawaselBrandMark:blank}};
const glyph=load('components/rast-loyalty/stamp-glyph.tsx',ui),card=load('components/rast-loyalty/rast-stamp-card.tsx',ui);
for(const style of ['star','check']){
  const html=renderToStaticMarkup(React.createElement(glyph.StampGlyph,{style}));
  check(html.includes('d="'+styles.stampPaths[style]+'"')&&html.includes('data-stamp-icon="'+style+'"'),style+' glyph');
}
const masked=renderToStaticMarkup(React.createElement(glyph.StampGlyph,{style:'brand',logoUrl:'/raw.png',stampLogo:'/api/wallet/brand/x/logo?shape=stamp'}));
check(masked.includes('data-stamp-logo')&&masked.includes('background-color:currentColor')&&masked.includes('mask:url(&quot;/api/wallet/brand/x/logo?shape=stamp&quot;)')&&!masked.includes('<img'),'logo stamp is tinted by the slot colour');
check(renderToStaticMarkup(React.createElement(glyph.StampGlyph,{style:'brand',logoUrl:'/raw.png'})).includes('src="/raw.png"'),'logo without a stamp rendition keeps its image');
check(renderToStaticMarkup(React.createElement(glyph.StampGlyph,{style:'brand'})).includes('d="'+styles.stampPaths.ceramic+'"'),'no logo falls back to an outline');
const render=(identity,stampStyle)=>renderToStaticMarkup(React.createElement(card.RastStampCard,{identity:{name:'Brand',logoUrl:'/original.png',cardBackground:'#0a1f43',...identity},stampStyle,stamps:1,required:4,rewardName:'Reward',preview:true})).match(/<ol[^>]*>([\s\S]*?)<\/ol>/)[1];
const count=(text,part)=>text.split(part).length-1;
for(const slug of [brands.generic,brands.together,brands.telecom,brands.fawasel]){
  for(const style of ['star','check'])check(count(render({slug},style),'d="'+styles.stampPaths[style]+'"')===4,style+' fills every slot for '+slug);
  const logo=render({slug},'brand');
  check(count(logo,'data-stamp-logo')===4&&count(logo,'/api/wallet/brand/'+slug+'/logo?shape=stamp')>=4&&!logo.includes('<img'),'logo stamps use the stamp rendition for '+slug);
}
check(render({slug:brands.generic,branchId:'branch-9'},'brand').includes('&amp;branch=branch-9'),'branch card uses its own logo');
check(count(render({slug:''},'brand'),'src="/original.png"')===4,'unknown brand keeps the plain image');
check(count(render({slug:brands.generic,logoUrl:null},'brand'),'d="'+styles.stampPaths.ceramic+'"')===4,'no logo keeps the default outline');
check(render({slug:brands.fawasel},'shirt').includes('lucide-shirt'),'Fawasel default stamp unchanged');

// Wallet artwork: same outlines, and one tinted logo per slot colour.
const art=load('lib/wallet/art.ts'),logos=load('lib/wallet/logo.ts'),stencil=load('lib/cafe/logo-stencil.ts');
const member={cafeSlug:brands.generic,cafeName:'Fixture',logoUrl:null,card:{id:'11111111-1111-4111-8111-111111111111',stampsInCycle:2,updatedAt:'2026-11-19'},program,experience};
for(const style of ['star','check'])for(const required of [4,7,30,31]){
  const svg=art.walletStampSvg({...member,program:{...program,stampStyle:style,purchasesRequired:required}});
  check(count(svg,'<path d="'+styles.stampPaths[style]+'"')===(required>30?1:required)&&!svg.includes('undefined'),style+' wallet slots for '+required);
}
const tinted=art.walletStampSvg({...member,program:{...program,stampStyle:'brand',purchasesRequired:5}},2,false,{'#123456':'data:ink','#ffffff':'data:paper'});
check(count(tinted,'href="data:paper"')===2&&count(tinted,'href="data:ink"')===3,'filled and empty slots get contrasting logos');
check(count(art.walletStampSvg({...member,program:{...program,stampStyle:'brand'}},2,false,'data:one'),'href="data:one"')===7,'single logo image still supported');
check(new URL(art.walletArtUrl({...member,program:{...program,stampStyle:'brand'}})).searchParams.get('v').includes(':brand:'+styles.STAMP_LOGO_VERSION+':'),'logo artwork address carries its rendition');
check(new URL(art.walletArtUrl({...member,program:{...program,stampStyle:'star'}})).searchParams.get('v').includes(':star:'),'star artwork address');

const svg=markup=>Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">'+markup+'</svg>');
const raw=async input=>{const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});return{pixels:new Uint8ClampedArray(data),...info};};
const at=(mask,width,x,y)=>mask[y*width+x];
(async()=>{
  // A badge keeps its shape and opens the lettering instead of becoming a blob.
  const badge=await raw(svg('<circle cx="200" cy="200" r="180" fill="#7a1f2b"/><rect x="120" y="170" width="160" height="60" fill="#ffffff"/>'));
  const badgeMask=stencil.logoStencilMask(badge.pixels,badge.width,badge.height);
  check(at(badgeMask,400,200,60)>240&&at(badgeMask,400,200,200)<16&&at(badgeMask,400,5,5)===0,'badge interior opened');
  // A light mark with dark details inside keeps the light shape.
  const light=await raw(svg('<circle cx="200" cy="200" r="170" fill="#f4efe6"/><rect x="150" y="150" width="100" height="100" fill="#2b1b12"/>'));
  const lightMask=stencil.logoStencilMask(light.pixels,light.width,light.height);
  check(at(lightMask,400,60,200)>240&&at(lightMask,400,200,200)<16,'light badge interior opened');
  // A rectangular plate inside transparent margins is a backdrop: its content becomes the mark.
  const plate=await raw(svg('<rect x="20" y="120" width="360" height="160" fill="#455248"/><rect x="150" y="170" width="100" height="60" fill="#fcf8f3"/>'));
  const plateMask=stencil.logoStencilMask(plate.pixels,plate.width,plate.height);
  check(at(plateMask,400,200,200)>240&&at(plateMask,400,40,140)<16&&at(plateMask,400,200,20)===0,'plate dropped and its content kept');
  // One colour, and separate elements in two colours, stay complete.
  const plain=await raw(svg('<rect x="60" y="150" width="280" height="100" fill="#ffffff"/>'));
  assert.deepEqual([...stencil.logoStencilMask(plain.pixels,400,400)],[...plain.pixels.filter((_,index)=>index%4===3)],'one colour mark untouched');checks++;
  const two=await raw(svg('<rect x="40" y="140" width="200" height="120" fill="#111111"/><circle cx="320" cy="200" r="50" fill="#ffb020"/>'));
  const twoMask=stencil.logoStencilMask(two.pixels,400,400);
  check(at(twoMask,400,140,200)===255&&at(twoMask,400,320,200)===255,'separate accent kept');
  // No transparency at all: the frame tone is the backdrop.
  const tile=await raw(svg('<defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#0b3d2e"/><stop offset="1" stop-color="#1f7a5a"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><circle cx="200" cy="200" r="90" fill="#f6e7c1"/>'));
  const tileMask=stencil.logoStencilMask(tile.pixels,400,400);
  check(at(tileMask,400,200,200)>240&&at(tileMask,400,20,20)<16&&at(tileMask,400,380,380)<16,'opaque backdrop removed');

  // Uploaded logo to stamp rendition to wallet artwork, as real images.
  const uploaded='data:image/png;base64,'+(await sharp(svg('<rect width="400" height="400" fill="#ffffff"/><circle cx="200" cy="200" r="170" fill="#7a1f2b"/><rect x="110" y="170" width="180" height="60" fill="#ffffff"/>')).png().toBuffer()).toString('base64');
  const branded={...member,logoUrl:uploaded,program:{...program,stampStyle:'brand',purchasesRequired:6}};
  const mark=await logos.walletStampLogo(branded),meta=await sharp(mark).metadata();
  check(meta.width===256&&meta.height===256&&meta.hasAlpha,'square transparent stamp rendition');
  const markPixels=await raw(mark);
  const pixel=(image,x,y)=>[...image.pixels.slice((y*image.width+x)*4,(y*image.width+x)*4+4)];
  check(pixel(markPixels,128,40)[3]>240&&pixel(markPixels,128,128)[3]<16&&pixel(markPixels,3,3)[3]===0,'uploaded white backdrop and lettering are clear');
  const ink=await raw(await logos.walletStampLogoTint(branded,'#123456',64));
  assert.deepEqual(pixel(ink,32,10).slice(0,3),[0x12,0x34,0x56],'tint uses the slot colour');checks++;
  for(const format of ['gif','webp','jpeg']){
    const other=await sharp(svg('<rect width="400" height="400" fill="#ffffff"/><rect x="80" y="80" width="240" height="240" fill="#224488"/>'))[format]().toBuffer();
    check((await sharp(await logos.walletStampLogo({...branded,logoUrl:'data:image/'+format+';base64,'+other.toString('base64')})).metadata()).width===256,format+' upload accepted');
  }
  const vector='data:image/svg+xml;base64,'+svg('<circle cx="200" cy="200" r="150" fill="#224488"/>').toString('base64');
  check((await sharp(await logos.walletStampLogo({...branded,logoUrl:vector})).metadata()).width===256,'svg upload accepted');
  await assert.rejects(()=>logos.walletStampLogo({...branded,logoUrl:'data:text/html;base64,PGI+'}),/wallet_invalid_asset/);checks++;
  await assert.rejects(()=>logos.walletStampLogo({...branded,logoUrl:'https://other.example.test/logo.png'}),/wallet_invalid_asset/);checks++;
  for(const dark of [false,true]){
    const strip=await raw(await art.walletStampArtwork(branded,2,dark));
    check(strip.width===750&&strip.height===288,'wallet strip size');
    const paper=pixel(strip,4,4).slice(0,3),tones=new Set();
    for(let index=0;index<strip.pixels.length;index+=4)tones.add(strip.pixels[index]>>4<<8|strip.pixels[index+1]>>4<<4|strip.pixels[index+2]>>4);
    check(tones.size>=2&&paper.join()===(dark?[0x12,0x34,0x56]:[0xff,0xff,0xff]).join(),'logo stamps drawn on the card colours');
  }
  for(const style of ['star','check']){
    const strip=await sharp(await art.walletStampArtwork({...member,program:{...program,stampStyle:style}},2,true)).metadata();
    check(strip.width===750&&strip.height===288,style+' wallet strip rendered');
  }

  // Public logo route serves the stamp rendition of the brand or branch logo.
  const calls=[];
  const route=load('app/api/wallet/brand/[slug]/logo/route.ts',{'@/lib/data/loyalty-experience':{getBranchLoyaltyBrand:async(slug,branch)=>{calls.push([slug,branch]);return slug==='known-brand'?{identity:{name:'Fixture',logoUrl:uploaded},program}:null;}}});
  const get=(query,slug='known-brand')=>route.GET(new Request('https://wallet.example.test/logo'+query),{params:Promise.resolve({slug})});
  const stamp=await get('?shape=stamp&branch=b1');
  check(stamp.status===200&&stamp.headers.get('content-type')==='image/png'&&calls.at(-1)[1]==='b1','stamp rendition served');
  check((await sharp(Buffer.from(await stamp.arrayBuffer())).metadata()).width===256,'stamp rendition is square');
  check((await sharp(Buffer.from(await (await get('')).arrayBuffer())).metadata()).width===640,'header logo unchanged');
  check((await get('?shape=stamp','missing-brand')).status===404,'unknown brand hidden');
  console.log('PASS '+checks+' star, check and logo stamp checks; synthetic images only, no live reads or writes');
})().catch(error=>{console.error(error);process.exitCode=1;});
