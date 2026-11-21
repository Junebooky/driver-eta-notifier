// Renders the real HQ components without the root layout's external map SDK.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=process.cwd(),api=new URL(process.env.REPORT_CHAT_QA_URL||'http://127.0.0.1:35434');
if(!['localhost','127.0.0.1'].includes(api.hostname))throw Error('Loopback QA API required');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'report-hq-harness-'));
fs.writeFileSync(path.join(dir,'entry.tsx'),`import React from ${JSON.stringify(path.join(root,'node_modules/react'))};import {createRoot} from ${JSON.stringify(path.join(root,'node_modules/react-dom/client'))};import {HqKakaoExcelImportView} from ${JSON.stringify(path.join(root,'components/hq/HqKakaoExcelImportView'))};createRoot(document.getElementById('root')).render(<main className="min-h-screen bg-slate-50 p-4 sm:p-8"><HqKakaoExcelImportView/></main>);`);
await require('esbuild').build({entryPoints:[path.join(dir,'entry.tsx')],bundle:true,format:'esm',outfile:path.join(dir,'app.js'),jsx:'automatic',tsconfig:path.join(root,'tsconfig.json'),nodePaths:[path.join(root,'node_modules')]});
const {compile}=require('@tailwindcss/node'),{Scanner}=require('@tailwindcss/oxide');
const compiler=await compile('@import "tailwindcss";',{base:root,onDependency:()=>{}}),scanner=new Scanner({sources:[{base:path.join(root,'components/hq'),pattern:'**/*.tsx',negated:false},{base:dir,pattern:'entry.tsx',negated:false}]});
fs.writeFileSync(path.join(dir,'style.css'),compiler.build(scanner.scan()));fs.writeFileSync(path.join(dir,'index.html'),'<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script type="module" src="/app.js"></script></html>');
const server=http.createServer((req,res)=>{
 if(req.url?.startsWith('/api/')){const upstream=http.request(new URL(req.url,api),{method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode||500,r.headers);r.pipe(res);});upstream.on('error',()=>res.writeHead(503).end());req.pipe(upstream);return;}
 const url=new URL(req.url||'/','http://localhost'),publicAsset=url.pathname.startsWith('/images/'),base=publicAsset?path.join(root,'public'):dir,file=path.resolve(base,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
 if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');fs.createReadStream(file).pipe(res);
});server.listen(Number(process.env.REPORT_QA_HQ_PORT||35436),'127.0.0.1',()=>console.log('Isolated HQ component harness ready'));
process.on('SIGTERM',()=>server.close());process.on('SIGINT',()=>server.close());
