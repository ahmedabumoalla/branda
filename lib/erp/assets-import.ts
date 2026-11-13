export const assetImportColumns=[['name','الاسم'],['code','الكود'],['quantity','الكمية'],['unitCost','سعر شراء الوحدة'],['acquiredOn','تاريخ الشراء'],['inServiceOn','تاريخ بداية الخدمة'],['usefulLifeMonths','العمر الإنتاجي بالشهور'],['residualValue','قيمة الخردة'],['depreciationAmount','مبلغ الإهلاك الدوري'],['depreciationRate','نسبة الإهلاك'],['depreciationStarts','تاريخ بدء الإهلاك'],['totalUnits','وحدات الإنتاج المتوقعة'],['serial','الرقم التسلسلي'],['barcode','باركود'],['description','الوصف']] as const;
export function readAssetCsv(text:string,delimiter:string):string[][]{
 if(![',',';','\t'].includes(delimiter)||text.length>5*1024*1024)throw new Error('المحدد أو حجم الملف غير صالح');
 const input=text.replace(/^\uFEFF/,'');const rows:string[][]=[];let row:string[]=[],value='',quoted=false,closed=false;
 const cell=()=>{if(value.length>4000||row.length>=60)throw new Error('الخلايا أو عدد الأعمدة يتجاوز الحد المسموح');row.push(value);value='';closed=false;};
 const line=()=>{cell();if(row.some(v=>v.trim()))rows.push(row);row=[];if(rows.length>101)throw new Error('الحد الأقصى مائة أصل في الملف');};
 for(let i=0;i<input.length;i++){const c=input[i];if(quoted){if(c==='"'){if(input[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;}else if(c===delimiter)cell();else if(c==='\n'||c==='\r'){if(c==='\r'&&input[i+1]==='\n')i++;line();}else if(c==='"'&&!value&&!closed)quoted=true;else if(closed||c==='"')throw new Error('علامات الاقتباس في الملف غير صحيحة');else value+=c;}
 if(quoted)throw new Error('علامة اقتباس غير مغلقة');if(value||row.length||closed)line();if(!rows.length)throw new Error('الملف فارغ');return rows;
}
