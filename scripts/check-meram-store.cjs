const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { transform } = require("lightningcss");

const storePath = "components/store/meram-store.tsx";
const cartPath = "components/store/meram-cart.tsx";
const cssPath = "components/store/meram-store.module.css";
const css = fs.readFileSync(cssPath,"utf8");
const styles = transform({filename:cssPath,code:Buffer.from(css),cssModules:true}).exports;
for (const file of [storePath,cartPath]) for (const [,name] of fs.readFileSync(file,"utf8").matchAll(/\bs\.(\w+)/g)) assert(styles[name], "Missing style " + name);
assert(css.includes("prefers-reduced-motion:reduce"));

function loader(mocks) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    const output = ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    new Function("require","exports",output)(name => {
      if (Object.hasOwn(mocks,name)) return mocks[name];
      if (name.endsWith(".module.css")) return {__esModule:true,default:Object.fromEntries(Object.keys(styles).map(key=>[key,key]))};
      if (name.startsWith("@/")) return load(name.slice(2)+".ts");
      return require(name);
    },exports);
    cache.set(file,exports);
    return exports;
  }
  return load;
}
const menu = {name:"ميرام",slug:"brand-5fbb1397e4c4",logoUrl:null,categories:[{id:"flowers",name:"ورود"}],contacts:{},products:[{
  id:"f03db936-2212-4c8c-b093-ad830bb707f3",name:"فازة الجمال الوردي",category:"ورود",categoryId:"flowers",description:"",ingredients:[],images:[],videos:[],price:100,available:true
}],highlights:{asOf:500,items:[
  {id:"ad",title:"إعلان منشور",kind:"announcement",productId:"f03db936-2212-4c8c-b093-ad830bb707f3"},
  {id:"sale",title:"عرض منشور",kind:"general",code:"GIFT"},
  {id:"expired",title:"عرض منتهي",kind:"general",expiresAt:480},
]}};
const settings = {enabled:true,deliveryEnabled:true,pickupEnabled:false,paymentMethods:["bank_transfer"],deliveryFee:0,vatRate:0,taxInclusive:true};
const shell = {
  StoreRetailContext:React.createContext(false),StoreDialog:({children})=>children,
  StorePhoto:({alt})=>React.createElement("span",null,alt),GiftProductDialog:()=>null
};
const baseMocks = {"./gift-store-dialogs":shell, "./meram-cart":{MeramCart:()=>null,MeramTracking:()=>null},"@/lib/analytics/public-tracking":{trackBrandEngagement(){}},
  "next/navigation":{useRouter:()=>({refresh(){}})}};
const store = loader(baseMocks)(storePath).MeramStore;
const markup = props => renderToStaticMarkup(React.createElement(store,{menu,settings,loyaltyEnabled:true,...props}));
const html = markup({});
for (const term of ["فازة الجمال الوردي","بطاقة الولاء","/loyalty/brand-5fbb1397e4c4","إعلان منشور","عرض منشور"]) assert(html.includes(term),term);
assert(!html.includes("عرض منتهي"));
assert(!markup({loyaltyEnabled:false}).includes("/loyalty/brand-5fbb1397e4c4"));
assert.match(html, /<article[^>]+id="meram-loyalty"[\s\S]*?<h2[^>]+id="meram-loyalty-title"[^>]*>كل زيارة تقرّبك من هديتك<\/h2>[\s\S]*?<a[^>]+href="\/loyalty\/brand-5fbb1397e4c4\?source=menu"[^>]*>أضيفي بطاقتك للمحفظة/);
assert.match(html, /<button[^>]+aria-label="فتح السلة"[^>]*><svg[\s\S]*?<\/svg><\/button>/);
assert(markup({menu:{...menu,categories:[],products:[],highlights:null}}).includes("تُضاف هدايا ميرام هنا"));
assert(markup({menu:{...menu,products:[{...menu.products[0],available:false}]}}).includes("نفدت الكمية"));

function harness(component,props,action) {
  const state=[],effects=[];
  let cursor=0;
  const hooks={...React,
    useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],next=>{state[i]=typeof next==="function"?next(state[i]):next;}];},
    useRef(initial){const i=cursor++;return state[i]??(state[i]={current:initial});},
    useEffect(callback){effects.push(callback);}
  };
  const Component=loader({...baseMocks,react:hooks,"@/app/actions/gift-orders":action})(cartPath)[component];
  return {effects,render(){cursor=0;effects.length=0;return Component(props);}};
}
function nodes(tree){if(!tree||typeof tree!=="object")return [];if(Array.isArray(tree))return tree.flatMap(nodes);return [tree,...nodes(tree.props?.children)];}
function words(tree){if(tree==null||typeof tree==="boolean")return "";if(Array.isArray(tree))return tree.map(words).join("");return typeof tree==="object"?words(tree.props?.children):String(tree);}
const line = {key:"1",quantity:1,productId:menu.products[0].id,selections:[]};
(async()=>{
  const received=[],calls=[];
  const props={slug:menu.slug,products:menu.products,lines:[line],settings,setLines(){},close(){},onReceipt:o=>received.push(o)};
  const submit={preventDefault(){},currentTarget:{customerName:"عميل اختبار",phone:"0591111111",city:"أبها",giftMessage:"هدية تخرج",notes:"بعد العصر"}};
  const original=global.FormData;
  global.FormData=class {constructor(values){this.values=values;}get(k){return this.values[k];}};
  const h=harness("MeramCart",props,{submitGiftOrderAction:async input=>{calls.push(input);return calls.length===1?{ok:false,error:"تعذر الاتصال"}:{ok:true,order:{number:42,trackingToken:"x".repeat(43)}};}});
  try {
    const first=h.render();
    assert(words(first).includes("تؤكد ميرام رسوم التوصيل"));
    nodes(first).find(n=>n.type==="button"&&words(n).includes("إضافة الإهداء")).props.onClick();
    let detail=h.render();
    assert.equal(nodes(detail).find(n=>n.type==="form").props.hidden,false);
    const location=()=>nodes(h.render()).find(n=>n.props?.name==="location");
    location().props.onChange({target:{value:"https://example.com/" }});
    const post=()=>nodes(h.render()).find(n=>n.type==="form").props.onSubmit(submit);
    await post();assert.equal(calls.length,0);
    assert(words(h.render()).includes("أضف رابط موقع"));
    location().props.onChange({target:{value:"18.22,42.52"}});
    await Promise.all([post(),post()]);
    assert.equal(calls.length,1);assert.equal(received.length,0);
    await post();
    assert.equal(calls[0].requestId,calls[1].requestId);assert.equal(received.length,1);
    const sent=calls[1];assert.equal(sent.giftMessage,"هدية تخرج");assert.equal(sent.notes,"بعد العصر");assert.equal(sent.phone,"966591111111");
    assert.equal(sent.city,"أبها");assert.equal(sent.paymentMethod,"bank_transfer");assert.equal(sent.fulfillment,"delivery");assert.equal(sent.expectedTotal,100);assert(sent.address.includes("google.com/maps/"));
    const disabled=harness("MeramCart",{...props,settings:{...settings,enabled:false}},{}).render();assert(nodes(disabled).find(n=>n.type==="button"&&words(n).includes("إضافة الإهداء")).props.disabled);
    const t=harness("MeramTracking",{slug:menu.slug,token:"x".repeat(43),receipt:null,close(){}},{trackGiftOrderAction:async()=>({ok:true,order:{number:42,status:"cancelled",rejectionReason:"تعذر توفير الورد المطلوب",total:100,items:[]}})});
    t.render();const cleanup=t.effects[0]();await Promise.resolve();assert(words(t.render()).includes("تعذر توفير الورد المطلوب"));cleanup();
    console.log("PASS Meram catalog, campaign/loyalty visibility, mobile CSS, checkout and tracking. Mocked only.");
  } finally {global.FormData=original;}
})().catch(error=>{console.error(error);process.exitCode=1;});
