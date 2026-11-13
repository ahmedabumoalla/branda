import {notFound} from 'next/navigation';
import {systemSettingsContext} from '@/lib/data/erp-settings';
import {oauthAuthorizationSchema,oauthScopeList,readOAuthClient} from '@/lib/erp/settings-oauth';
import {SystemOAuthConsent} from '@/components/erp/settings/oauth-consent';
export default async function ConnectPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const p=oauthAuthorizationSchema.safeParse(await searchParams);if(!p.success)notFound();let scopes:string[],client:Awaited<ReturnType<typeof readOAuthClient>>;try{scopes=oauthScopeList(p.data.scope);client=await readOAuthClient(p.data.client_id);if(!client.redirectUris.includes(p.data.redirect_uri))notFound();}catch{notFound();}const c=await systemSettingsContext();return <SystemOAuthConsent slug={c.cafe.slug} brand={c.cafe.name} client={client} scopes={scopes} request={Object.fromEntries(Object.entries(p.data).filter(([,v])=>v!==undefined))}/>;}
