// Run with the deployment's server-only environment; never expose credentials in output.
import {createClient} from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw Error('Server storage configuration is required');
const storage=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}).storage;
const bucket='bf-inventory-images';
const current=await storage.getBucket(bucket);
if(current.error){
  if(!['404','400'].includes(String(current.error.statusCode))||!/not found/i.test(current.error.message))throw Error('Cannot inspect inventory image storage');
  const result=await storage.createBucket(bucket,{public:false,fileSizeLimit:3*1024*1024,allowedMimeTypes:['image/webp']});
  if(result.error)throw Error('Cannot create private inventory image storage');
}
const verified=await storage.getBucket(bucket);
if(verified.error||verified.data.public||Number(verified.data.file_size_limit)!==3*1024*1024||JSON.stringify(verified.data.allowed_mime_types)!==JSON.stringify(['image/webp']))throw Error('Inventory image storage policy mismatch');
console.log(JSON.stringify({bucket,private:true,maxBytes:verified.data.file_size_limit,mimeTypes:verified.data.allowed_mime_types,at:new Date().toISOString()}));
