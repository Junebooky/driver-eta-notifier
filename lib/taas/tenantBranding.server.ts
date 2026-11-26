import {createHash} from 'node:crypto';
import {supabaseAdmin as db} from '../supabase/server';
import {canonicalTenantHostname} from '../auth/tenantIdentity';
import {BRAND_HEADERS,parseTenantBrand,brandIconDigest,buildTenantManifest,type TenantBrand,type BrandIconSize} from './tenantBranding';

export type BrandDependencies={
 lookup:(hostname:string)=>Promise<unknown>;
 privateBucket:()=>Promise<boolean>;
 download:(path:string)=>Promise<Blob|null>;
};
// A new domain or setting alone cannot activate the application.
// Do not connect to the public layout/routes until trusted ingress and all P0 gates pass.
const BRAND_RUNTIME_RELEASED:boolean=false;
export async function resolveTenantBrand(trustedHost:string,deps:BrandDependencies):Promise<TenantBrand|null>{
 const host=canonicalTenantHostname(trustedHost);if(!host)return null;
 try{return parseTenantBrand(host,await deps.lookup(host));}catch{return null;}
}
const notFound=()=>new Response(null,{status:404,headers:BRAND_HEADERS});
export async function tenantManifestResponse(trustedHost:string,deps:BrandDependencies):Promise<Response>{
 const b=await resolveTenantBrand(trustedHost,deps);
 return b?Response.json(buildTenantManifest(b),{headers:{...BRAND_HEADERS,'Content-Type':'application/manifest+json; charset=utf-8'}}):notFound();
}
function pngDimensions(bytes:Uint8Array,size:BrandIconSize):boolean{
 const b=Buffer.from(bytes);
 return b.length>=33&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  &&b.readUInt32BE(8)===13&&b.toString('ascii',12,16)==='IHDR'
  &&b.readUInt32BE(16)===size&&b.readUInt32BE(20)===size;
}
/** Only an approved, exact digest and dimension from the current host's settings.
 * No signed URL, public bucket, remote URL, or caller-provided object path. */
export async function tenantBrandIconResponse(trustedHost:string,size:unknown,revision:unknown,deps:BrandDependencies):Promise<Response>{
 try{
  if(size!==192&&size!==512)return notFound();
  const b=await resolveTenantBrand(trustedHost,deps);if(!b||revision!==brandIconDigest(b,size))return notFound();
  if(!await deps.privateBucket())return notFound();
  const blob=await deps.download(b.orgId+'/branding/'+brandIconDigest(b,size)+'.png');
  if(!blob||blob.type!=='image/png'||blob.size<33||blob.size>2*1024*1024)return notFound();
  const buffer=await blob.arrayBuffer(),bytes=new Uint8Array(buffer);
  if(bytes.length!==blob.size||!pngDimensions(bytes,size)||createHash('sha256').update(bytes).digest('hex')!==revision)return notFound();
  const fresh=await resolveTenantBrand(trustedHost,deps);
  if(!fresh||fresh.orgId!==b.orgId||brandIconDigest(fresh,size)!==revision)return notFound();
  return new Response(buffer,{headers:{...BRAND_HEADERS,'Content-Type':'image/png','Content-Length':String(bytes.length)}});
 }catch{return notFound();}
}
const dependencies:BrandDependencies={
 async lookup(host){
  const r=await db.rpc('tenant_public_brand_v1',{p_hostname:host});return r.error?null:r.data;
 },
 async privateBucket(){const r=await db.storage.getBucket('cockpit-assets');return !r.error&&r.data?.public===false;},
 async download(path){const r=await db.storage.from('cockpit-assets').download(path);return r.error?null:r.data;},
};
export const tenantBrandCandidate=(trustedHost:string)=>BRAND_RUNTIME_RELEASED?resolveTenantBrand(trustedHost,dependencies):Promise.resolve(null);
export const tenantManifestCandidate=(trustedHost:string)=>BRAND_RUNTIME_RELEASED?tenantManifestResponse(trustedHost,dependencies):Promise.resolve(notFound());
export const tenantBrandIconCandidate=(trustedHost:string,size:unknown,revision:unknown)=>BRAND_RUNTIME_RELEASED?tenantBrandIconResponse(trustedHost,size,revision,dependencies):Promise.resolve(notFound());
