const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
function load(file, stubs = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {}; cache.set(file, exports);
  new Function('require', 'exports', output)(name => {
    if (name in stubs) return stubs[name];
    if (name === 'server-only') return {};
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const target = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name);
      return load(target + (fs.existsSync(path.join(root, target + '.tsx')) ? '.tsx' : '.ts'), stubs, cache);
    }
    return require(name);
  }, exports);
  return exports;
}
const { approvedLoyaltyColors, readableBrandForeground } = load('lib/loyalty/approved-design.ts');
assert.deepEqual(approvedLoyaltyColors('kat-coffe', { primary: '#733b27', secondary: '#e6b576', text: '#FCF8F3' }), { background: '#733b27', foreground: '#FCF8F3', accent: '#e6b576' });
assert.equal(approvedLoyaltyColors('test-cafe', { primary: '#0a1f43' }).background, '#0a1f43');
assert.equal(approvedLoyaltyColors('rast', { primary: '#F6BE18' }).background, '#3b1420');
assert.equal(approvedLoyaltyColors('unknown', { primary: 'url(bad)' }).background, '#4a281d');
assert.equal(readableBrandForeground('#ffffff', '#ffffff'), '#000000');
assert.equal(readableBrandForeground('#000000', '#000000'), '#ffffff');

const { clearLogoBackdrop } = load('lib/loyalty/logo-alpha.ts');
const pixels = new Uint8Array(7 * 7 * 4).fill(255);
for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) if (x !== 3 || y !== 3) pixels.set([30, 60, 90, 255], (y * 7 + x) * 4);
clearLogoBackdrop(pixels, 7, 7);
assert.equal(pixels[3], 0); assert.equal(pixels[(2 * 7 + 2) * 4 + 3], 255); assert.equal(pixels[(3 * 7 + 3) * 4 + 3], 255, 'Enclosed white logo details survive');
const alpha = Uint8Array.from(pixels); clearLogoBackdrop(pixels, 7, 7); assert.deepEqual(pixels, alpha, 'Transparent marks are not recolored or erased');

const uiStubs = { 'next/link': { __esModule: true, default: 'a' }, 'next/image': { __esModule: true, default: ({ unoptimized, ...props }) => React.createElement('img', props) } };
const { RastStampCard } = load('components/rast-loyalty/rast-stamp-card.tsx', uiStubs);
const { loyaltyTheme } = load('components/rast-loyalty/loyalty-theme.ts');
for (const stampStyle of ['ceramic', 'paper', 'meal', 'brand']) for (const stamps of [0, 2, 3]) {
  const markup = renderToStaticMarkup(React.createElement(RastStampCard, { identity: { slug: 'test-cafe', name: 'Brand', logoUrl: '/original.png', logoDisplayUrl: '/transparent.png', cardBackground: '#0a1f43' }, stampStyle, stamps, required: 3, rewardName: 'Reward', preview: true }));
  const stampRow = markup.match(/<ol[^>]*>([\s\S]*?)<\/ol>/)[1];
  assert(!stampRow.includes('lucide-gift'), 'The last visit is a stamp, never a gift');
  assert.equal((stampRow.match(/<li /g) || []).length, 3);
  assert.equal((stampRow.match(/stampCheck/g) || []).length, stamps);
  if (stampStyle === 'brand') assert.equal((stampRow.match(/src="\/transparent.png"/g) || []).length, 3);
  assert(markup.includes('lucide-gift'), 'Reward keeps its separate gift icon');
}
for (const [background, foreground, emptyFilter, filledFilter] of [
  ['#0a1f43', '#ffffff', 'brightness(0) invert(1)', 'brightness(0)'],
  ['#ffffff', '#000000', 'brightness(0)', 'brightness(0) invert(1)'],
  ['#000000', '#aaaaaa', 'brightness(0) invert(1)', 'brightness(0)'],
]) {
  const theme = loyaltyTheme({ slug: 'brand', name: 'Brand', cardBackground: background, cardForeground: foreground });
  assert.equal(theme['--card-logo-filter'], emptyFilter);
  assert.equal(theme['--card-stamp-logo-filter'], filledFilter);
}
const stampCss = fs.readFileSync(path.join(root, 'components/rast-loyalty/rast-loyalty.module.css'), 'utf8');
assert.match(stampCss, /\.stamps li > img\s*\{\s*filter: var\(--card-logo-filter, brightness\(0\) invert\(1\)\)/);
assert.match(stampCss, /\.stamps \.collected > img\s*\{\s*filter: var\(--card-stamp-logo-filter, brightness\(0\)\)/);
const { SharedLoyaltyCard } = load('components/loyalty/shared-loyalty-card.tsx', uiStubs);
const card = { brandSlug: 'kat-coffe', brandName: 'كاث', cardBackground: '#733b27', cardForeground: '#fcf8f3', cardAccent: '#e6b576', logoPreviewUrl: '/own-logo.png', sampleCode: 'REAL_CARD', stampsRequired: 7, completedStamps: 3, rewardTitle: 'مكافأة كاث' };
let html = renderToStaticMarkup(React.createElement(SharedLoyaltyCard, { card, pointsBalance: 12, pointValueSar: .25, pointsEnabled: true }));
assert(html.includes('brand-stamps-v1') && html.includes('--card-background:#733b27') && html.includes('/own-logo.png'));
assert.equal((html.match(/aria-label="الختم /g) || []).length, 7); assert.equal((html.match(/class="collected"/g) || []).length, 3);
assert(html.includes('REAL_CARD') && html.includes('مكافأة كاث') && html.includes('3.00'));
assert(!html.includes('KAWAKIB') && !html.includes('الكواكب'));
html = renderToStaticMarkup(React.createElement(SharedLoyaltyCard, { card: { ...card, cardBackground: '#F6BE18' } }));
assert(!html.includes('#F6BE18') && html.includes('--card-background:#4a281d'));

let opening=false;
const enrollmentStubs={...uiStubs,
  react:{...React,useState:value=>[value==='details'?'done':value,()=>{}],useTransition:()=>[opening,()=>{}]},
  'next/navigation':{useRouter:()=>({refresh:()=>assert.fail('SSR must not issue a refresh')})},
  '@/app/actions/loyalty-experience':{},
};
const {RastEnrollment}=load('components/rast-loyalty/rast-enrollment.tsx',enrollmentStubs);
for(const authenticated of [false,true]){
  opening=false;html=renderToStaticMarkup(React.createElement(RastEnrollment,{identity:{slug:'kat-coffe',name:'كاث',logoUrl:null},program:{enabled:true,purchasesRequired:7,rewardName:'قهوة'},authenticated}));
  assert(!html.includes('جار فتح بطاقتك'));
  opening=true;html=renderToStaticMarkup(React.createElement(RastEnrollment,{identity:{slug:'kat-coffe',name:'كاث',logoUrl:null},program:{enabled:true,purchasesRequired:7,rewardName:'قهوة'},authenticated}));
  assert(html.includes('جار فتح بطاقتك')&&html.includes('disabled="" aria-busy="true"')&&html.includes('spinner'));
}

// Exercise the native download event lifecycle without issuing a pass or contacting a provider.
for (const provider of ['apple', 'google']) {
  const slots = [], effects = [], windowEvents = new Map(), documentEvents = new Map(), timers = new Map(); let index = 0, cleanup, effectDeps;
  global.window = { addEventListener: (k,v) => windowEvents.set(k,v), removeEventListener: k => windowEvents.delete(k), setTimeout: cb => { timers.set(1,cb); return 1; }, clearTimeout: k => timers.delete(k) };
  global.document = { visibilityState: 'visible', addEventListener: (k,v) => documentEvents.set(k,v), removeEventListener: k => documentEvents.delete(k) };
  const hooks = { ...React,
    useState(initial) { const i=index++; if (!(i in slots)) slots[i]=initial; return [slots[i], v=>slots[i]=v]; },
    useRef(initial) { const i=index++; return slots[i] ??= { current: initial }; },
    useEffect(fn,deps) { if (!effectDeps || deps[0]!==effectDeps[0]) { effects.push(fn); effectDeps=deps; } },
  };
  const { WalletDownloadLink } = load('components/rast-loyalty/wallet-download-link.tsx', { react: hooks });
  function render() { index=0; const node=WalletDownloadLink({ provider, cardCode:'OWN_CARD' }); while(effects.length) { cleanup?.(); cleanup=effects.shift()(); } return node; }
  const event = extra => ({button:0,prevented:false,preventDefault(){this.prevented=true;},...extra});
  let node=render(); assert.equal(node.props.href, `/api/wallet/${provider}/OWN_CARD`);
  const modified=event({ctrlKey:true}); node.props.onClick(modified); assert.equal(render().props['aria-busy'],false);
  const first=event(); node.props.onClick(first); assert(!first.prevented,'First click retains native download'); node=render(); assert(node.props['aria-disabled']);
  assert(renderToStaticMarkup(node).includes('جار فتح المحفظة'));
  const twice=event(); node.props.onClick(twice); assert(twice.prevented,'Duplicate request is blocked');
  windowEvents.get('pageshow')(); assert.equal(render().props['aria-busy'],false);
  node=render();node.props.onClick(event());render();timers.get(1)();node=render();assert(!node.props['aria-busy']);assert(renderToStaticMarkup(node).includes('لم تفتح؟ حاول مجددًا'));
  node.props.onClick(event());render();cleanup();assert.equal(windowEvents.size+documentEvents.size+timers.size,0);
}
delete global.window;delete global.document;

(async()=>{
  let enabled=true, queried=[];
  const cafe={id:'own-tenant',slug:'kat-coffe',name:'كاث'};
  const admin={from(table){ const q={select(){return q},eq(key,value){assert.equal(key,'cafe_id');assert.equal(value,cafe.id);return q},async maybeSingle(){queried.push(table);return {error:null,data:table==='cafe_custom_identity'?{palette:{primary:'#733b27',secondary:'#e6b576',text:'#fcf8f3'}}:{enabled:true,card_background:'#F6BE18',card_design:{cardBackground:'#F6BE18'},purchases_required:7}}}};return q;}};
  const stubs={'@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/data/cafes':{getCafeBySlug:async slug=>{assert.equal(slug,cafe.slug);return cafe;}},'@/lib/data/feature-entitlements':{getCafeFeatureCodes:async()=>enabled?['loyalty']:[]}};
  const {getPublicLoyaltyProgramBySlug}=load('lib/data/loyalty-cards.ts',stubs);
  const program=await getPublicLoyaltyProgramBySlug(cafe.slug);assert.equal(program.cardBackground,'#733b27');assert.equal(program.cardDesign.cardBackground,'#733b27');assert.equal(program.purchasesRequired,7);
  enabled=false;queried=[];assert.equal(await getPublicLoyaltyProgramBySlug(cafe.slug),null);assert.equal(queried.length,0,'No identity or program reads after denied entitlement');
  console.log('PASS approved brand palettes, contrast, stamp layout, real balances/QR, transparent logo bounds, tenant/package gates and Apple/Google pending/duplicate/return/retry/cleanup behavior');
})().catch(e=>{console.error(e);process.exitCode=1;});
