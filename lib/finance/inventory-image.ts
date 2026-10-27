import sharp from "sharp";
import { INVENTORY_IMAGE_MAX_BYTES } from "./inventory-catalog";

export async function sanitizeInventoryImage(bytes:Uint8Array) {
  if(!bytes.length||bytes.length>INVENTORY_IMAGE_MAX_BYTES)throw new Error("اختر صورة بحجم لا يتجاوز 3 ميجابايت");
  const signature=Buffer.from(bytes.subarray(0,12));
  const raster=signature.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff]))||signature.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||(signature.subarray(0,4).toString()==="RIFF"&&signature.subarray(8,12).toString()==="WEBP");
  if(!raster)throw new Error("اختر صورة ثابتة بصيغة PNG أو JPEG أو WebP");
  const source=sharp(bytes,{limitInputPixels:25_000_000,failOn:"warning"});
  const metadata=await source.metadata();
  if(!metadata.format||!["jpeg","png","webp"].includes(metadata.format)||(metadata.pages??1)>1)throw new Error("اختر صورة ثابتة بصيغة PNG أو JPEG أو WebP");
  // Decode and encode raster pixels; remove EXIF/location and reject active document formats.
  return source.rotate().resize({width:1200,height:1200,fit:"inside",withoutEnlargement:true}).webp({quality:82}).toBuffer();
}
export async function readInventoryUpload(request:Request) {
  const max=INVENTORY_IMAGE_MAX_BYTES+64*1024;
  if(Number(request.headers.get("content-length"))>max)throw new Error("الصورة أكبر من الحد المسموح");
  if(!request.body)throw new Error("اختر صورة للصنف");
  const reader=request.body.getReader();let total=0;const chunks:Uint8Array[]=[];
  try {for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel();throw new Error("الصورة أكبر من الحد المسموح");}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=Buffer.concat(chunks);
  const form=await new Response(bytes,{headers:{"content-type":request.headers.get("content-type")??""}}).formData();
  const file=form.get("file");
  if(!(file instanceof File))throw new Error("اختر صورة للصنف");
  return sanitizeInventoryImage(new Uint8Array(await file.arrayBuffer()));
}
