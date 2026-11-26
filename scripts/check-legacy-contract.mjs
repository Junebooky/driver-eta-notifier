import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';
const baseline=JSON.parse(readFileSync('docs/taas/legacy-contract-baseline.json','utf8'));
const errors=[];
function requireFile(path) {
 if(!existsSync(path)){errors.push('Missing legacy entry: '+path);return null;}
 return readFileSync(path);
}
for(const path of [...baseline.routes,...baseline.unitTests,...baseline.integrationTests]) requireFile(path);
for(const [path,sha] of Object.entries(baseline.migrations)){
 const bytes=requireFile(path);
 if(!bytes)continue;
 const digest=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
 if(digest!==sha)errors.push('Historical migration changed; use a forward migration: '+path);
}
for(const [path,methods] of Object.entries(baseline.criticalMethods)){
 const bytes=requireFile(path);
 if(!bytes)continue;
 const source=ts.createSourceFile(path,bytes.toString('utf8'),ts.ScriptTarget.Latest,true);
 const exported=new Set();
 for(const node of source.statements){
  const modifiers=ts.canHaveModifiers(node)?ts.getModifiers(node):undefined;
  if(modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)){
   if(ts.isFunctionDeclaration(node)&&node.name)exported.add(node.name.text);
   if(ts.isVariableStatement(node))for(const decl of node.declarationList.declarations)if(ts.isIdentifier(decl.name))exported.add(decl.name.text);
  }
  if(ts.isExportDeclaration(node)&&!node.isTypeOnly&&node.exportClause&&ts.isNamedExports(node.exportClause)){
   for(const element of node.exportClause.elements)if(!element.isTypeOnly)exported.add(element.name.text);
  }
 }
 for(const method of methods)if(!exported.has(method))errors.push('Missing legacy HTTP method '+method+' '+path);
}
const reportSource=requireFile('utils/sharedReportPublicUrl.ts');
if(reportSource&&!reportSource.toString('utf8').includes(baseline.reportOrigin))errors.push('Existing public report origin must remain supported.');
const vercel=requireFile('vercel.json');
if(vercel&&!JSON.parse(vercel.toString('utf8')).crons?.some(c=>c.path===baseline.reportWorkerPath))errors.push('Report worker cron path removed.');
assert.deepEqual(errors,[],'Legacy compatibility gate failed. Keep a compatible route/adapter and add forward migrations; baseline changes require explicit review.');
console.log('Legacy compatibility gate: '+baseline.routes.length+' route files, '+Object.keys(baseline.criticalMethods).length+' API method contracts, '+Object.keys(baseline.migrations).length+' historical SQL migrations, '+baseline.unitTests.length+' unit and '+baseline.integrationTests.length+' integration test entry points retained.');
