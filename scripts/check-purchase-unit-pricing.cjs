const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),crypto=require('node:crypto');
const inputs=new Set();
function load(file,mocks={}){inputs.add(file);const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>{if(name in mocks)return mocks[name];if(name.endsWith('.css'))return new Proxy({},{get:(_,key)=>key});if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name);return load(fs.existsSync(base+'.ts')?base+'.ts':base+'.tsx',mocks);}return require(name);},exports);return exports;}
let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const near=(actual,expected,label)=>{assert.ok(Math.abs(actual-expected)<=Number.EPSILON*Math.max(1,Math.abs(expected))*4,`${label}: ${actual} != ${expected}`);checks++;};
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const itemId=id(1),units=[{itemId,name:'Piece',factor:1},{itemId,name:'Box',factor:12},{itemId,name:'Carton',factor:120},{itemId,name:'Pallet',factor:6000}];
const {convertPurchaseUnitPrice:convert}=load('lib/erp/purchase-units.ts');
eq(convert(2,itemId,'Piece','Box',units),24,'piece price scales to box');
eq(convert(24,itemId,'Box','Carton',units),240,'box price scales by cartons per box ratio');
eq(convert(240,itemId,'Carton','Pallet',units),12000,'carton price scales to arbitrary fourth level');
eq(convert(12000,itemId,'Pallet','Piece',units),2,'pallet price returns to base unit');
eq(convert(29.5,itemId,'Box','Carton',units),295,'manual entered price remains conversion basis');
near(convert(10,itemId,'Box','Piece',units),10/12,'unit conversion retains internal precision');
near(convert(convert(50,itemId,'Box','Piece',units),itemId,'Piece','Box',units),50,'unit conversion round trip preserves the original price');
eq(convert(0,itemId,'Piece','Box',units),0,'free price remains zero');
eq(convert(1.2345,itemId,'Piece','Piece',units),1.2345,'same unit preserves existing precision');
eq(convert(7,itemId,'Unknown','Box',units),7,'missing prior conversion never invents a price');
eq(convert(7,itemId,'Piece','Unknown',units),7,'missing next conversion retains price');
eq(convert(7,id(8),'Piece','Box',units),7,'unit factors are item scoped');
eq(convert(7,itemId,'Piece','Box',[{itemId,name:'Piece',factor:0},{itemId,name:'Box',factor:12}]),7,'invalid zero factor cannot divide price');
function hooks(){let at=0;const state=[];return{api:{...React,useId:()=>`id-${at++}`,useState(initial){const i=at++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],next=>{state[i]=typeof next==='function'?next(state[i]):next;}];},useRef(initial){const i=at++;return state[i]??(state[i]={current:initial});}},render(Component,props){at=0;return Component(props);}};}
const nodes=x=>Array.isArray(x)?x.flatMap(nodes):x?.props?[x,...nodes(x.props.children)]:[];
const control=(tree,label)=>{const row=nodes(tree).find(x=>x.props['aria-label']===label);assert(row,'Missing '+label);return row;};
const domain=load('lib/erp/purchases.ts');
function editor(defaults={},pos){
 const h=hooks(),tracking=[{lotId:id(7),quantity:2}];
 const snapshot={slug:'brand-a',brand:'Brand',settings:{revision:0,fields:[],defaultPaid:false,defaultReceived:true,discountMode:'both',taxMode:'item',adjustmentAccountId:null,showExchangeRate:false,allowAdjustment:false,allowCreditNotes:false,shareEnabled:false,statuses:[]},finance:{role:'owner',items:[{id:itemId,name:'Item',sku:'ITEM',unit:'Piece',average_cost:2.25,active:true}],warehouses:[{id:id(2),name:'Warehouse',active:true}],settings:{vat_rate:15,tax_inclusive:false},units:[],accounts:[],staff:[]},suppliers:[],blockedItems:[],categories:[],units,itemDefaults:{[itemId]:{trackingMode:'batch',...defaults}},costCenters:[]};
 let value={...domain.newPurchase(snapshot,'invoice'),lines:[{id:id(3),itemId,description:'Item',unit:'Piece',quantity:2,price:2.35,discount:0,discountType:'amount',taxRate:15,costCenterId:null,tracking}]};
 const Component=load('components/erp/purchases/editor.tsx',{react:h.api,'@/components/erp/inventory/tracking':{TrackingRows:'Tracking'},'@/components/erp/fields/field-values':{ErpFieldValues:'CustomFields'},'./product-dialog':{PurchaseProductDialog:'ProductDialog'},'./supplier-dialog':{PurchaseSupplierDialog:'SupplierDialog'}}).PurchaseEditor;
 const render=()=>h.render(Component,{snapshot,value,pos,pending:false,onChange:next=>{value=next;},onSave(){},onCancel(){}});
 return{render,get value(){return value;},tracking};
}
for(const pos of [undefined,{accountId:id(4),accountName:'Drawer',allowCredit:false}]){
 const h=editor({},pos);let tree=h.render();
 control(tree,'وحدة الكمية').props.onChange({target:{value:'Box'}});
 near(h.value.lines[0].price,28.2,'actual shared editor converts current manual price');
 eq(h.value.lines[0].quantity,2,'selected-unit count is preserved');
 eq(h.value.lines[0].tracking,h.tracking,'existing assigned tracking is not silently erased');
 tree=h.render();eq(nodes(tree).find(x=>x.type==='Tracking').props.expected,24,'tracking target reflects new base quantity');
 if(pos)eq(h.value.paid,64.86,'POS fixed full payment follows converted total');
 control(tree,'سعر الوحدة').props.onChange({target:{valueAsNumber:29.5}});tree=h.render();
 control(tree,'وحدة الكمية').props.onChange({target:{value:'Carton'}});
 eq(h.value.lines[0].price,295,'actual editor preserves latest manual unit price basis');
 eq(h.value.lines[0].unit,'Carton','selected unit and converted price change together');
}
for(const [defaults,want,label] of [[{buyUnitName:'Carton'},270,'base average cost converts to purchase unit'],[{buyUnitName:'Carton',buyPrice:175},175,'saved purchase-unit price stays unchanged'],[{buyUnitName:'Carton',buyPrice:0},0,'saved zero purchase price is respected'],[{},2.25,'base average cost remains when no purchase unit selected']]){
 const h=editor(defaults),tree=h.render(),picker=nodes(tree).find(node=>node.type?.name==='PurchaseItemPicker');assert(picker,'Missing purchase item picker');picker.props.onSelect(itemId);
 eq(h.value.lines[0].price,want,label);eq(h.value.lines[0].quantity,2,'item replacement keeps chosen count');
}
inputs.add('scripts/check-purchase-unit-pricing.cjs');inputs.add('package-lock.json');
const report={at:new Date().toISOString(),runtime:process.version,checks,status:'passed',limits:'Actual editor event handlers with isolated React hooks and pure conversion helpers; no browser, database or invoice saved',inputs:Object.fromEntries([...inputs].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]))};
fs.mkdirSync('output/inventory-unit-templates-20261115',{recursive:true});fs.writeFileSync('output/inventory-unit-templates-20261115/purchase-pricing-verification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
