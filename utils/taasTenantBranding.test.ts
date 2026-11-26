import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {buildTenantManifest,buildTenantMetadata,parseTenantBrand} from '../lib/taas/tenantBranding';
import {tenantManifestResponse,tenantBrandIconResponse,tenantManifestCandidate,type BrandDependencies} from '../lib/taas/tenantBranding.server';
import {accountHome} from './loginPortal';
const fixture=(size:number)=>{
 // Header-only synthetic fixture; tests digest and dimensions, not a full PNG decoder.
 const bytes=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.writeUInt32BE(13,8);
 bytes.write('IHDR',12);bytes.writeUInt32BE(size,16);bytes.writeUInt32BE(size,20);
 return {digest:createHash('sha256').update(bytes).digest('hex'),blob:new Blob([new Uint8Array(bytes)],{type:'image/png'})};
};
const a=fixture(192),b=fixture(512);
const vip={hostname:'vip.example.test',orgId:'vip_limousine_korea',displayName:'VIP fixture',appName:'VIP fixture Cockpit',shortName:'VIP fixture',description:'VIP fixture driver app',icon192:a.digest,icon512:b.digest};
const ch={...vip,hostname:'chauffeur.example.test',orgId:'chauffeur_service',displayName:'Chauffeur fixture',appName:'Chauffeur fixture Cockpit',shortName:'Chauffeur fixture',description:'Chauffeur fixture driver app'};
function setup(){
 const calls:string[]=[];
 const deps:BrandDependencies={lookup:async host=>host===vip.hostname?vip:host===ch.hostname?ch:null,privateBucket:async()=>true,
 download:async path=>{calls.push(path);return path.endsWith(a.digest+'.png')?a.blob:b.blob;}};
 return {deps,calls};
}
test('same code builds separate host-scoped manifests and metadata; existing launch remains role-based',async()=>{
 const {deps}=setup();
 for(const brand of [vip,ch]){
  const r=await tenantManifestResponse(brand.hostname,deps);assert.equal(r.status,200);assert.match(r.headers.get('cache-control')||'',/no-store/);
  const manifest=await r.json();assert.equal(manifest.name,brand.appName);assert.equal(manifest.id,'/');assert.equal(manifest.scope,'/');assert.equal(manifest.start_url,'/');
  assert.deepEqual(manifest.icons.map((i:{sizes:string})=>i.sizes),['192x192','512x512']);
  const parsed=parseTenantBrand(brand.hostname,brand);assert.ok(parsed);assert.deepEqual(buildTenantManifest(parsed),manifest);
  assert.equal(buildTenantMetadata(parsed).appleWebApp.title,brand.shortName);
 }
 assert.equal((await tenantManifestResponse('unknown.example.test',deps)).status,404);
 assert.equal((await tenantManifestResponse('https://vip.example.test',deps)).status,404);
 assert.equal((await tenantManifestResponse(ch.hostname,{...deps,lookup:async()=>vip})).status,404);
 assert.equal((await tenantManifestResponse(ch.hostname,{...deps,lookup:async()=>({...ch,icon512:'https://foreign.test/x'})})).status,404);
 assert.equal((await tenantManifestResponse(ch.hostname,{...deps,lookup:async()=>({...ch,appName:'bad\nname'})})).status,404);
 assert.equal((await tenantManifestCandidate(ch.hostname)).status,404);
 const legacy=JSON.parse(readFileSync('public/manifest.json','utf8'));assert.equal(legacy.name,'Protocol Cockpit');assert.equal(legacy.start_url,'/');
 assert.equal(accountHome({role:'hq_admin'}),'/hq?tab=dashboard');assert.equal(accountHome({role:'driver'}),'/');
});
test('brand icon is derived from verified host and digest, not caller path; reject corruption and revocation',async()=>{
 const {deps,calls}=setup();
 assert.equal((await tenantBrandIconResponse(ch.hostname,192,a.digest,deps)).status,200);
 assert.deepEqual(calls,[ch.orgId+'/branding/'+a.digest+'.png']);
 assert.equal((await tenantBrandIconResponse(vip.hostname,512,b.digest,deps)).status,200);
 assert.equal(calls[1],vip.orgId+'/branding/'+b.digest+'.png');
 assert.equal((await tenantBrandIconResponse(ch.hostname,192,b.digest,deps)).status,404);
 assert.equal((await tenantBrandIconResponse(ch.hostname,'../../',a.digest,deps)).status,404);
 assert.equal(calls.length,2);
 assert.equal((await tenantBrandIconResponse(ch.hostname,192,a.digest,{...deps,download:async()=>b.blob})).status,404);
 assert.equal((await tenantBrandIconResponse(ch.hostname,192,a.digest,{...deps,privateBucket:async()=>false})).status,404);
 let n=0;
 assert.equal((await tenantBrandIconResponse(ch.hostname,192,a.digest,{...deps,lookup:async()=>++n===1?ch:null})).status,404);
});
