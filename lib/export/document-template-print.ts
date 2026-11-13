/** Uses the browser's native print/save-as-PDF dialog; no generated or saved-file claim. */
export async function printDocumentFrame(frame:Pick<HTMLIFrameElement,'contentDocument'|'contentWindow'>|null,isCurrent:()=>boolean=()=>true){
 const document=frame?.contentDocument,window=frame?.contentWindow;
 if(!document||!window)throw new Error('تعذر فتح المستند للطباعة أعد تجهيز المعاينة');
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const assets=Promise.all([document.fonts?.ready,...Array.from(document.images).map(async image=>{if(image.complete&&image.naturalWidth>0)return;if(typeof image.decode==='function')await image.decode();else if(!image.complete)await new Promise<void>((resolve,reject)=>{image.addEventListener('load',()=>resolve(),{once:true});image.addEventListener('error',()=>reject(new Error('تعذر تحميل إحدى صور المستند')),{once:true});});if(!image.naturalWidth)throw new Error('تعذر تحميل إحدى صور المستند');})]);
  await Promise.race([assets,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('لم يكتمل تحميل المستند أعد المحاولة بعد لحظات')),15000);})]);
  if(!isCurrent())return false;
  window.focus();window.print();return true;
 }catch(reason){if(reason instanceof Error&&/[\u0600-\u06ff]/.test(reason.message))throw reason;throw new Error('تعذر تجهيز المستند أو فتح نافذة الطباعة أعد المحاولة');}finally{if(timer)clearTimeout(timer);}
}
