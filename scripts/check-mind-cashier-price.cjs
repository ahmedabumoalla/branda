const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const filename=path.resolve('scripts/check-butcher-pos.cjs');
let harness=fs.readFileSync(filename,'utf8').split('async function main()')[0];
harness=harness.replace("normalized: 'forbidden-phone', payload() { throw Error('Customer payload must not run for butcher'); }","normalized: '', payload() { return {}; }");
harness=harness.replace('const mocks = { react: hooks,',"const mocks = { './finance-pos-locale': localeMock, './hospital-orders-toolbar': { HospitalOrdersToolbar() {} }, react: hooks,");
harness=harness.replace('return FinancePOS({ initialSnapshot: data });','const wrapper = FinancePOS({ initialSnapshot: data }); return wrapper.props.children.type(wrapper.props.children.props);');
const extra=`
const localeMock={FinancePosLocaleProvider(){},FinancePosModal:function Modal(){},PosNumeric(){},useFinancePosLocale:()=>({language:'en',dir:'ltr',setLanguage(){},t:(ar,en)=>en||ar,productName:p=>p.name,categoryName:String,displayName:String,money:String,number:String,date:String})};
async function main(){
 const coffee={...product,id:'coffee',name:'Coffee',price:0,priceMode:'cashier',butcherDetails:null,stockTracked:false};
 for(const value of [undefined,0,-1,100000.01,1.111,NaN,Infinity]) assert.throws(()=>selection.financeProductSelection(coffee,undefined,false,value));
 for(const value of [.01,14.75,100000])assert.equal(selection.financeProductSelection(coffee,undefined,false,value).product.price,value);
 const fixed={...coffee,price:9,priceMode:'fixed'};
 assert.equal(selection.financeProductSelection(fixed,undefined,false,22).product.price,9);
 const chosen=selection.financeSelectedCartLines([{productId:'coffee',quantity:3,unitPrice:14.75}],[coffee]);
 assert.equal(chosen[0].product.price,14.75);assert.equal(chosen[0].priceChanged,false);assert.equal(receipt(chosen).total,44.25);
 assert.equal(selection.financeSelectedCartLines([{productId:'coffee',quantity:1}],[coffee]).length,0);
 const changed=selection.financeSelectedCartLines([{productId:'coffee',quantity:1,unitPrice:14.75}],[fixed]);assert.equal(changed[0].priceChanged,true);
 const data={...snapshot,cafe:{...snapshot.cafe,slug:'mind-hospital',businessCategory:'cafes'},products:[coffee],shifts:[{id:'shift',user_id:'user',status:'open',account_id:'cash'}]};
 const h=harness(data),render=()=>h.render(),add=()=>find(render(),n=>n.type==='button'&&n.props['aria-label']?.startsWith('إضافة Coffee')).props.onClick();
 add();assert.equal(button(render(),'Confirm price').props.disabled,true);
 const input=()=>find(render(),n=>n.type==='input'&&n.props.max==='100000');
 for(const value of ['','0','-2','100001','1.111']){input().props.onChange({target:{value}});assert.equal(button(render(),'Confirm price').props.disabled,true);}
 input().props.onChange({target:{value:'14.75'}});assert.equal(button(render(),'Confirm price').props.disabled,false);button(render(),'Confirm price').props.onClick();
 add();assert.equal(find(render(),n=>n.type==='input'&&n.props['aria-label']==='كمية Coffee').props.value,2);
 button(render(),'Edit price').props.onClick();assert.equal(input().props.value,'14.75');input().props.onChange({target:{value:'12.5'}});button(render(),'Confirm price').props.onClick();
 assert.equal(find(render(),n=>n.type==='input'&&n.props['aria-label']==='كمية Coffee').props.value,2);
 await button(render(),'تأكيد الاستلام وإصدار إيصال').props.onClick();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0][1].lines[0].unitPrice,12.5);assert.equal(h.calls[0][1].lines[0].expectedUnitPrice,12.5);assert.equal(h.calls[0][1].expectedTotal,25);
 console.log('PASS direct MIND cashier pricing: guarded input, modal validation, fixed-price protection, pinned quantity price, receipt amount and checkout payload');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
`;
const test=new Module(filename,module);test.filename=filename;test.paths=Module._nodeModulePaths(path.dirname(filename));test._compile(harness+extra,filename);
