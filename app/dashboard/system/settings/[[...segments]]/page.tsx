import {notFound} from 'next/navigation';
import {readSystemSettings,systemSettingsContext} from '@/lib/data/erp-settings';
import {systemSettingsSections,type SystemSettingsSection} from '@/lib/erp/settings';
import {SystemSettingsWorkspace} from '@/components/erp/settings/workspace';
import {getFinanceInvoiceSettings} from '@/app/actions/finance-invoice-settings';
import {defaultSystemProducts} from '@/lib/erp/settings-products';
import {readBrandFinanceSnapshot} from '@/lib/data/brand-finance';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{segments?:string[]}>}){
  const {segments=[]}=await params,section=segments[0]||'account';
  if(segments.length>1||!Object.hasOwn(systemSettingsSections,section))notFound();
  const context=await systemSettingsContext();
  const [initial,finance,products,numbers]=await Promise.all([
    readSystemSettings(),
    ['payments','taxes','numbering','general'].includes(section)?(async()=>{
      const [state,snapshot]=await Promise.all([
        getFinanceInvoiceSettings(context.cafe.slug),
        section==='payments'||section==='taxes'?readBrandFinanceSnapshot(context):Promise.resolve(null),
      ]);
      if(!state.ok)throw new Error(state.message);
      return{state:state.data,accounts:snapshot?.accounts??null,settings:snapshot?.settings??null};
    })():Promise.resolve(null),
    section==='taxes'?(async()=>{
      const result=await context.client.rpc('erp_system_product_configuration',{p_cafe:context.cafe.id});
      if(result.error)throw new Error('تعذر تحميل ضرائب المنتجات');
      return result.data;
    })():Promise.resolve(defaultSystemProducts),
    section==='numbering'?(async()=>{
      const result=await context.client.rpc('erp_system_numbering',{p_cafe:context.cafe.id});
      if(result.error)throw new Error('تعذر تحميل الترقيم');
      return result.data;
    })():Promise.resolve(null),
  ]);
  if(numbers!==null)initial.numbering=numbers;
  return <SystemSettingsWorkspace key={section+JSON.stringify([initial.general.revision,initial.appearance.revision,initial.appsRevision])} initial={initial} section={section as SystemSettingsSection} finance={finance} products={products}/>;
}
