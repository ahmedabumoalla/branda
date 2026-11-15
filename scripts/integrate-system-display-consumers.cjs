// One-time AST-bounded integration: presentation calls only, inside React components.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const changes=[];
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of walk('components/erp').filter(p=>p.endsWith('.tsx')&&!/[\\/](settings|templates|store|branches)[\\/]/.test(p))){
 const source=fs.readFileSync(file,'utf8');if(source.includes('erpDisplay'))continue;
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[],components=new Set();
 function component(node){for(let p=node.parent;p;p=p.parent)if(ts.isFunctionDeclaration(p)&&p.name&&/^[A-Z]/.test(p.name.text)&&p.body)return p;return null;}
 function visit(node){const owner=component(node);let replacement;
  if(owner&&ts.isCallExpression(node)){
   if(ts.isIdentifier(node.expression)&&['money','ledgerAmount'].includes(node.expression.text)&&node.arguments.length===1){replacement=`erpDisplay.amount(${node.arguments[0].getText(ast)},${node.expression.text})`;}
   else if(ts.isPropertyAccessExpression(node.expression)&&['toLocaleString','toLocaleDateString'].includes(node.expression.name.text)&&ts.isNewExpression(node.expression.expression)&&node.expression.expression.expression.getText(ast)==='Date'&&node.expression.expression.arguments?.length===1&&node.arguments[0]?.getText(ast).match(/^['"]ar-SA['"]$/)){
    replacement=`erpDisplay.${node.expression.name.text==='toLocaleString'?'dateTime':'date'}(${node.expression.expression.arguments[0].getText(ast)})`;
   }
  }
  if(replacement){edits.push({start:node.getStart(ast),end:node.end,text:replacement});components.add(owner);return;}
  ts.forEachChild(node,visit);
 }
 visit(ast);if(!edits.length)continue;
 for(const owner of components)edits.push({start:owner.body.getStart(ast)+1,end:owner.body.getStart(ast)+1,text:'const erpDisplay=useSystemFormat();'});
 const importNode=ast.statements.find(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text==='@/components/erp/settings/preferences');
 if(importNode){if(!importNode.getText(ast).includes('useSystemFormat'))throw Error('Review import '+file);}
 else {const directive=ast.statements[0];if(!ts.isExpressionStatement(directive)||!ts.isStringLiteral(directive.expression)||directive.expression.text!=='use client')throw Error('Review client boundary '+file);edits.push({start:directive.end,end:directive.end,text:"\nimport {useSystemFormat} from '@/components/erp/settings/preferences';"});}
 let result=source;for(const e of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,e.start)+e.text+result.slice(e.end);
 fs.writeFileSync(file,result);changes.push({file,calls:edits.length-components.size-(!importNode?1:0)});
}
fs.writeFileSync('output/integrated-system/system-display-consumers.json',JSON.stringify(changes,null,2));console.log(JSON.stringify(changes));
