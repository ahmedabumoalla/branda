import {oauthOrigin,oauthScopes} from '@/lib/erp/settings-oauth';
export async function GET(request:Request){const root=oauthOrigin(request);return Response.json({resource:root+'/api/erp/mcp',authorization_servers:[root],scopes_supported:oauthScopes,bearer_methods_supported:['header'],resource_name:'Branda ERP'},{headers:{'Cache-Control':'public, max-age=3600'}});}
