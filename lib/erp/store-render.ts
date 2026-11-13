import type { StoreBlock, StoreAsset } from "./store";
const escape = (s: string) => s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function storeEmbedUrl(href:string,kind:"video"|"map"):string|null {
  try{const url=new URL(href);if(url.protocol!=="https:")return null;
    if(kind==="video") {let id:string|null=null;if(url.hostname==="youtu.be")id=url.pathname.slice(1);if(["youtube.com","www.youtube.com","www.youtube-nocookie.com"].includes(url.hostname))id=url.searchParams.get("v")??url.pathname.match(/^\/embed\/([\w-]+)$/)?.[1]??null;return id&&/^[\w-]{11}$/.test(id)?`https://www.youtube-nocookie.com/embed/${id}`:null;}
    if(["www.google.com","maps.google.com"].includes(url.hostname)&&url.pathname.startsWith("/maps"))return href;
    if(url.hostname==="www.openstreetmap.org"&&url.pathname==="/export/embed.html")return href;
  }catch{/* The caller renders a normal safe link when there is no supported embed. */}return null;
}
export function storeBlockHtml(block: StoreBlock, assets: StoreAsset[]): string {
  const b=block,s=b.style,style=`color:${s.color};background:${s.background};font-size:${s.fontSize}px;padding:${s.padding}px;text-align:${s.align};width:${s.width}%;box-sizing:border-box`;
  const attr=`id="${b.id}" style="${style}"`,text=escape(b.text),children=b.children.map(x=>storeBlockHtml(x,assets)).join("\n"),name=escape(b.name||b.id),required=b.required?' required':"";
  if(b.type==="image"){const a=assets.find(x=>x.id===b.assetId);return a?.url?`<img ${attr} src="${escape(a.url)}" alt="${escape(b.alt||a.alt)}">`:"";}
  if(b.type==="video"){const embed=storeEmbedUrl(b.href,"video");return embed?`<iframe ${attr} title="${escape(b.text||"فيديو")}" src="${escape(embed)}" sandbox="allow-scripts allow-same-origin allow-presentation" allowfullscreen loading="lazy" referrerpolicy="no-referrer"></iframe>`:b.href?`<video ${attr} controls src="${escape(b.href)}"></video>`:`<div ${attr}>${text}</div>`;}
  if(b.type==="countdown")return `<time ${attr} data-store-deadline="${escape(b.deadline)}">0 : 0 : 0 : 0</time>`;
  if(b.type==="map"){const embed=storeEmbedUrl(b.href,"map");return embed?`<iframe ${attr} title="${escape(b.text||"الخريطة")}" src="${escape(embed)}" sandbox="allow-scripts allow-same-origin" loading="lazy" referrerpolicy="no-referrer"></iframe>`:`<a ${attr} href="${escape(b.href)}" target="_blank" rel="noopener noreferrer">${text||"الخريطة"}</a>`;}
  if(["link","linkBlock","navbar"].includes(b.type))return `<a ${attr} href="${escape(b.href||"#")}">${text}${children}</a>`;
  if(b.type==="radio")return `<fieldset ${attr}><legend>${text}</legend>${b.options.map(o=>`<label><input name="${name}" type="radio" value="${escape(o)}"${required}>${escape(o)}</label>`).join("")}</fieldset>`;
  if(["input","textarea","select","checkbox"].includes(b.type)){const field=b.type==="textarea"?`<textarea name="${name}" maxlength="2000"${required}></textarea>`:b.type==="select"?`<select name="${name}"${required}><option value="">اختر</option>${b.options.map(o=>`<option value="${escape(o)}">${escape(o)}</option>`).join("")}</select>`:`<input name="${name}" type="${b.type==="input"?"text":b.type}"${b.type==="input"?' maxlength="2000"':''}${required}>`;return `<label ${attr}>${text}${field}</label>`;}
  if(b.type==="button")return `<button ${attr} type="submit">${text}</button>`;
  if(b.type==="quote")return `<blockquote ${attr}>${text}${children}</blockquote>`;
  if(b.type==="form")return `<form ${attr}>${children}</form>`;
  const cols=b.type==="columns2"?"repeat(2,minmax(0,1fr))":b.type==="columns3"?"repeat(3,minmax(0,1fr))":b.type==="columns37"?"3fr 7fr":null;
  if(cols)return `<div id="${b.id}" style="${style};display:grid;grid-template-columns:${cols}">${children}</div>`;
  return `<div ${attr}>${["column"].includes(b.type)?"":text}${children}</div>`;
}
export function storePageHtml(title:string,blocks:StoreBlock[],assets:StoreAsset[],direction="rtl"){return `<!doctype html>\n<html lang="${direction==="rtl"?"ar":"en"}" dir="${direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><link rel="stylesheet" href="styles.css"></head><body>${blocks.map(b=>storeBlockHtml(b,assets)).join("\n")}</body></html>`;}
export const storePageCss = "*{box-sizing:border-box}body{margin:0;font-family:Tahoma,sans-serif;color:#28231b}img,video{max-width:100%;height:auto}input,textarea,select,button{font:inherit;max-width:100%}label{display:block}@media(max-width:600px){[style*=grid-template-columns]{grid-template-columns:1fr!important}}";
/** A small stored ZIP writer avoids a new runtime dependency. Names and text use UTF-8. */
export function storeZip(files:({name:string;text:string}|{name:string;data:Uint8Array})[]):Uint8Array {
  const encoder=new TextEncoder(),parts:Uint8Array[]=[],directory:Uint8Array[]=[];let offset=0;
  const crc=(data:Uint8Array)=>{let n=0xffffffff;for(const byte of data){n^=byte;for(let i=0;i<8;i++)n=(n>>>1)^(0xedb88320&-(n&1));}return(n^0xffffffff)>>>0;};
  for(const file of files){const name=encoder.encode(file.name),data="data" in file?file.data:encoder.encode(file.text),sum=crc(data),local=new Uint8Array(30+name.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint32(14,sum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);local.set(name,30);parts.push(local,data);const central=new Uint8Array(46+name.length),c=new DataView(central.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint32(16,sum,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46);directory.push(central);offset+=local.length+data.length;}
  const size=directory.reduce((n,p)=>n+p.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);const out=new Uint8Array(offset+size+end.length);let at=0;for(const p of [...parts,...directory,end]){out.set(p,at);at+=p.length;}return out;
}
