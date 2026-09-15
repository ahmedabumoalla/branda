// Downloads only currently published brands' referenced logos for visual inspection
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { createClient } = require('@supabase/supabase-js');
async function run() {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false},realtime:{transport:require('next/dist/compiled/ws')}});
  const {data:brands,error}=await c.from('cafes').select('id,slug,name,cafe_settings(logo_url,logo_storage_path)').is('deleted_at',null);
  if(error)throw error;
  const directory=path.resolve('.codex-tmp/menu-logo-sources');
  await fs.mkdir(directory,{recursive:true});
  for(const b of brands){
    const settings=b.cafe_settings;
    let url=settings?.logo_url;
    const asset=settings?.logo_storage_path;
    if(asset?.startsWith(b.id+'/')&&!asset.includes('..')){
      const {data,error}=await c.storage.from('cafe-logos').createSignedUrl(asset,3600);
      if(error)throw error;
      url=data.signedUrl;
    }
    if(!url){console.log(JSON.stringify({slug:b.slug,name:b.name,missing:true}));continue;}
    const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error(`${b.slug}: HTTP ${response.status}`);
    const buffer=Buffer.from(await response.arrayBuffer());
    const metadata=await sharp(buffer).metadata();
    const stat=await sharp(buffer).stats();
    const file=path.join(directory,b.slug+'.'+metadata.format);
    await fs.writeFile(file,buffer);
    console.log(JSON.stringify({slug:b.slug,name:b.name,file,width:metadata.width,height:metadata.height,alpha:metadata.hasAlpha,opaque:stat.isOpaque,hash:crypto.createHash('sha256').update(buffer).digest('hex')}));
  }
}
run().catch(e=>{console.error(e.message);process.exitCode=1});
