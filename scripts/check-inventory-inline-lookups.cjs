const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react');
function load(file,mocks){const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','exports',code)(name=>{if(name in mocks)return mocks[name];if(name.endsWith('.css'))return new Proxy({},{get:(_,key)=>key});return require(name);},exports);return exports;}
function hooks(){let at=0;const slots=[];return{api:{...React,useId:()=>`field-${at++}`,useState(initial){const i=at++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value];},useRef(initial){const i=at++;return slots[i]??(slots[i]={current:initial});}},render(fn,props){at=0;return fn(props);}};}
const nodes=x=>Array.isArray(x)?x.flatMap(nodes):x&&typeof x==='object'?[x,...nodes(x.props?.children)]:[];
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const Select=()=>null, FieldValues=()=>null, Bundle=()=>null, TemplateDialog=()=>null;
const inventory=load('lib/erp/inventory.ts',{});
let assertions=0;function eq(a,b,label){assert.deepEqual(a,b,label);assertions++;}
function harness({rejectFirst=false,canCreate=true}={}){
 const h=hooks(),calls=[],saves=[];let rejects=rejectFirst;
 const snapshot={slug:'brand-a',canCreate,canUpdate:true,settings:{payload:{}},catalogs:[{id:id(1),kind:'brand',name:'Existing',active:true,payload:{},revision:1}],units:[{id:id(2),name:'Unit'}],items:[],branchScope:{branchId:id(90),revision:4}};
 const Form=load('components/erp/inventory/item-editor.tsx',{
  react:h.api,'@/lib/erp/inventory':inventory,'@/lib/erp/inventory-tracking':{trackingModes:{}},
  './lifecycle':{BundleRecipe:Bundle},'./ui':{Select},'./creatable-select':{CreatableSelect:Select},'./unit-template-dialog':{UnitTemplateDialog:TemplateDialog},
  '@/components/erp/fields/field-values':{ErpFieldValues:FieldValues},
  '@/components/erp/branches/context':{withBranchScope:(value,snapshot)=>({...value,branchScope:snapshot.branchScope})},
  '@/app/actions/erp-inventory':{executeInventory:async(input,slug)=>{calls.push({type:'catalog',input,slug});if(rejects){rejects=false;return{ok:false,message:'Retry'};}return{ok:true,data:{id:id(3)}};}},
  '@/app/actions/finance-inventory-catalog':{saveFinanceInventoryUnitAction:async(input,slug)=>{calls.push({type:'unit',input,slug});return{ok:true,unit:{id:id(4),name:input.name}};}},
 }).ItemEditor;
 const props={snapshot,busy:false,save:async(...args)=>{saves.push(args);return true;}};
 let tree;const render=()=>tree=h.render(Form,props);render();
 return{snapshot,calls,saves,render,get tree(){return tree;},get form(){return nodes(tree).find(n=>n.type==='form');},lookup:label=>nodes(tree).find(n=>n.type===Select&&n.props.label===label),name:value=>{nodes(tree).find(n=>n.type==='input'&&n.props.required).props.onChange({target:{value}});render();}};
}
(async()=>{
 const h=harness({rejectFirst:true});
 eq(h.lookup('الماركة').props.value,'','new brand is blank');eq(h.lookup('التصنيف').props.value,'','new category is blank');eq(h.lookup('الوحدة الأساسية').props.value,'','new unit is blank');
 const reused=await h.lookup('الماركة').props.onCreate(' existing ');eq(reused.id,id(1),'existing brand reused ignoring outer spaces/case');eq(h.calls.length,0,'existing match makes no write');
 await assert.rejects(h.lookup('التصنيف').props.onCreate(' Category '),/Retry/);assertions++;
 const created=await h.lookup('التصنيف').props.onCreate(' Category ');h.render();eq(h.calls[0].input.requestId,h.calls[1].input.requestId,'uncertain save retries same request');eq(h.calls[1].input.branchScope,h.snapshot.branchScope,'catalog retains live branch revision');eq(h.calls[1].slug,'brand-a','catalog pins current tenant');eq(h.calls[1].input.payload,{kind:'category',name:'Category',active:true},'typed name uses original catalog command');
 eq(h.lookup('التصنيف').props.options.some(row=>row.id===created.id),true,'created category remains in choices without navigation');h.lookup('التصنيف').props.onChange(created.id);h.render();eq(h.lookup('التصنيف').props.value,created.id,'created category can be selected');
 const unit=await h.lookup('الوحدة الأساسية').props.onCreate(' Box ');h.render();eq(h.calls.at(-1).type,'unit','base unit uses original unit action');eq(h.calls.at(-1).input.name,'Box','unit trimmed');eq(h.lookup('الوحدة الأساسية').props.options.some(row=>row.id===unit.id),true,'new unit retained');
 await assert.rejects(h.lookup('الوحدة الأساسية').props.onCreate('x'.repeat(31)));assertions++;
 h.name('Draft retained');h.lookup('الماركة').props.onPendingChange(true);await h.form.props.onSubmit({preventDefault(){}});eq(h.saves.length,0,'synchronous pending lock blocks item submit');h.render();eq(h.lookup('الماركة').props.disabled,true,'pending disables other edits');h.lookup('الماركة').props.onPendingChange(false);h.render();await h.form.props.onSubmit({preventDefault(){}});eq(h.saves[0][1].name,'Draft retained','creating lookups preserves unrelated draft');eq(h.saves[0][1].categoryId,created.id,'item submits selected saved category');
 const t=harness();const template={id:id(5),kind:'unit_template',name:'Packing',active:true,revision:1,payload:{units:[{name:'Unit',factor:1},{name:'Box',factor:6},{name:'Carton',factor:60}]}};t.snapshot.catalogs.push(template);t.render();
 const templateSelect=()=>nodes(t.tree).find(n=>n.type==='select'&&nodes(n).some(child=>child.type==='option'&&child.props.value===template.id));
 const priceUnit=label=>nodes(t.tree).find(n=>n.props?.label===label).props.children;
 templateSelect().props.onChange({target:{value:template.id}});t.render();eq(t.lookup('الوحدة الأساسية').props.value,id(2),'template selects matching base unit');eq(t.lookup('الوحدة الأساسية').props.disabled,true,'template prevents mismatched base edits');eq(priceUnit('سعر الشراء لكل').props.options.map(row=>row.id),['Unit','Box','Carton'],'all template units available for pricing');
 priceUnit('سعر الشراء لكل').props.onChange('Carton');priceUnit('سعر البيع لكل').props.onChange('Box');t.name('Template item');await t.form.props.onSubmit({preventDefault(){}});eq(t.saves[0][1].payload.buyUnitName,'Carton','purchase price basis persisted');eq(t.saves[0][1].payload.saleUnitName,'Box','sale price basis persisted');eq(t.saves[0][1].unitTemplateId,template.id,'template relation persisted');
 const addTemplate=nodes(t.tree).find(n=>n.type==='button'&&nodes(n).some(child=>child.props?.size===15));addTemplate.props.onClick();t.render();eq(nodes(t.form).some(n=>n.type===TemplateDialog),false,'template dialog sits outside item form');eq(nodes(t.tree).some(n=>n.type===TemplateDialog),true,'same dialog opens from item');await t.form.props.onSubmit({preventDefault(){}});eq(t.saves.length,1,'parent submit blocked with template dialog open');
 const dialog=nodes(t.tree).find(n=>n.type===TemplateDialog);const createdTemplate={...template,id:id(6),name:'New packing'};dialog.props.onSaved(createdTemplate);t.render();eq(nodes(t.tree).some(n=>n.type==='option'&&n.props.value===createdTemplate.id),true,'saved template selectable without refresh');eq(priceUnit('سعر الشراء لكل').props.value,'Carton','compatible price basis retained after selecting created template');eq(t.calls.length,0,'applying saved template does not issue duplicate catalog writes');
 nodes(t.tree).find(n=>n.type==='select'&&n.props.value===createdTemplate.id).props.onChange({target:{value:''}});t.render();eq(t.lookup('الوحدة الأساسية').props.disabled,false,'clearing template restores standalone unit selection');eq(nodes(t.tree).some(n=>n.props?.label==='سعر الشراء لكل'),false,'standalone units need no conversion selector');
 const denied=harness({canCreate:false});await assert.rejects(denied.lookup('الماركة').props.onCreate('Denied'));assertions++;eq(denied.calls.length,0,'no-create UI cannot request creation');
 const paths=[];const actions=load('app/actions/finance-inventory-catalog.ts',{'next/cache':{revalidatePath:(...args)=>paths.push(args)},'@/lib/performance/finance-route-invalidation':{invalidateFinanceViews:()=>{}},'@/lib/data/finance-inventory-catalog':{saveFinanceInventoryUnit:async()=>({unit:{id:id(9),name:'Unit'}})}});await actions.saveFinanceInventoryUnitAction({name:'Unit',requestId:id(8)},'brand-a');eq(paths,[['/dashboard/system/inventory','layout']],'saved units invalidate nested inventory pages for next item');
 console.log(JSON.stringify({at:new Date().toISOString(),runtime:process.version,assertions,result:'passed',scope:'Actual item form and unit action with isolated hooks and fake save responses; no database writes'}));
})().catch(error=>{console.error(error);process.exitCode=1});
