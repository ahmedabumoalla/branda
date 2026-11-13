const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const evidence='output/erp-database/verify-erp-source-integrity.result.json',query=JSON.parse(fs.readFileSync(evidence,'utf8'));
if(query.exitCode!==0||query.error)throw Error('Live history read failed');
const rows=JSON.parse(query.stdout).rows;if(!Array.isArray(rows)||rows.length<51)throw Error('Applied history missing');
const results=rows.map(row=>{const file=`${row.version}_${row.name}.sql`,currentMd5=crypto.createHash('md5').update(fs.readFileSync(path.join('supabase/migrations',file))).digest('hex');return {file,appliedMd5:row.source_md5,currentMd5,match:row.source_md5===currentMd5};});
const passed=results.every(x=>x.match);fs.writeFileSync('output/integrated-system/erp-applied-source-integrity.json',JSON.stringify({at:new Date().toISOString(),readAt:query.finishedAt,evidence,passed,count:results.length,results},null,2));console.log(JSON.stringify({passed,count:results.length,mismatches:results.filter(x=>!x.match).map(x=>x.file)}));if(!passed)process.exitCode=1;
