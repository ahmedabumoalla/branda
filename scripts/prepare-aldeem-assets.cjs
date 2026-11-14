const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),output=path.join(root,'public/aldeem');
const manifest=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
(async()=>{fs.mkdirSync(output,{recursive:true});for(const [name,file] of Object.entries(manifest)){if(!/^(hero|logo|(?:right|middle|left)-\d+)$/.test(name))throw Error('Invalid asset');await sharp(file).resize({width:name==='hero'?1200:900,withoutEnlargement:true}).webp({quality:88}).toFile(path.join(output,`${name}.webp`));}console.log({assets:Object.keys(manifest).length});})().catch(e=>{console.error(e.message);process.exitCode=1});
