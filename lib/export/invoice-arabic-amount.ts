const ones=['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة'];
const teens=['عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'];
const tens=['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
const hundreds=['','مائة','مائتان','ثلاثمائة','أربعمائة','خمسمائة','ستمائة','سبعمائة','ثمانمائة','تسعمائة'];
function small(n:number):string { const h=Math.floor(n/100),r=n%100;const rest=r<10?ones[r]:r<20?teens[r-10]:[ones[r%10],tens[Math.floor(r/10)]].filter(Boolean).join(' و');return [hundreds[h],rest].filter(Boolean).join(' و'); }
function integer(n:number):string { if(!n)return 'صفر';const parts:string[]=[];for(const [size,singular,dual,plural]of [[1_000_000,'مليون','مليونان','ملايين'],[1000,'ألف','ألفان','آلاف']] as const){const group=Math.floor(n/size);if(group){parts.push(group===1?singular:group===2?dual:`${small(group)} ${group<=10?plural:singular}`);n%=size;}}if(n)parts.push(small(n));return parts.join(' و'); }
export function invoiceAmountInWords(cents:number){const whole=Math.floor(cents/100),fraction=cents%100;return `${integer(whole)} ريالًا${fraction?` و${integer(fraction)} هللة`:''} فقط لا غير`;}
