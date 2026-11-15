const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),stage=path.join(root,'output/offline-finance-windows-20261114/Branda-Finance-Offline'),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(stage,'manifest.json'),'utf8')),runtimeFiles=['server.cjs','storage.cjs','network-guard.cjs','backup.cjs','engine/index.mjs','engine/local-boundary.sql','engine/schema/finance-schema.json','actions/dist/actions.cjs','dist/public/app.js','dist/public/app.css','dist/public/utilities.css'];
const comparisons=runtimeFiles.map(file=>({file,sourceSha256:hash(path.join(__dirname,file)),packagedSha256:hash(path.join(stage,file))}));
if(comparisons.some(x=>x.sourceSha256!==x.packagedSha256))throw Error('Runtime package mismatch');
const build=JSON.parse(fs.readFileSync(path.join(__dirname,'client/build-manifest.json'),'utf8'));const changedInputs=build.sourceInputs.filter(entry=>hash(path.resolve(root,entry.file))!==entry.sha256).map(x=>x.file);
if(changedInputs.length)throw Error('Source changed after bundle: '+JSON.stringify(changedInputs));
const record={checkedAt:new Date().toISOString(),node:process.version,archiveSha256:hash(path.join(stage,'../Branda-Finance-Offline-Windows.zip')),files:manifest.files.length,matchedSourceInputs:build.sourceInputs.length,comparisons};
fs.writeFileSync(path.join(root,'output/offline-finance-integration-20261114/final-source-match.json'),JSON.stringify(record,null,2));console.log(JSON.stringify({matchedRuntime:comparisons.length,matchedSourceInputs:build.sourceInputs.length,archiveSha256:record.archiveSha256}));
