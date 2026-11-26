import {canonicalTenantHostname} from '../auth/tenantIdentity';

export type BrandIconSize=192|512;
export interface TenantBrand {
 hostname:string;orgId:string;displayName:string;appName:string;shortName:string;description:string;icon192:string;icon512:string;
}
export const BRAND_HEADERS={'Cache-Control':'private, no-store, max-age=0','Vary':'Host','X-Content-Type-Options':'nosniff'} as const;
const digest=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
function label(value:unknown,max:number):value is string{
 return typeof value==='string'&&value===value.trim()&&value.length>=1&&Array.from(value).length<=max
  &&!(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value));
}
export function parseTenantBrand(host:unknown,raw:unknown):TenantBrand|null{
 const hostname=canonicalTenantHostname(host);
 if(!hostname||!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const r=raw as Record<string,unknown>;
 if(r.hostname!==hostname||typeof r.orgId!=='string'||!/^[a-z][a-z0-9_]{2,62}$/.test(r.orgId)
  ||!label(r.displayName,160)||!label(r.appName,100)||!label(r.shortName,32)||!label(r.description,160)
  ||!digest(r.icon192)||!digest(r.icon512))return null;
 return {hostname,orgId:r.orgId,displayName:r.displayName,appName:r.appName,shortName:r.shortName,description:r.description,icon192:r.icon192,icon512:r.icon512};
}
export function brandIconDigest(brand:TenantBrand,size:BrandIconSize){return size===192?brand.icon192:brand.icon512;}
/** Never accept arbitrary URLs, tenant IDs or file paths from the browser. */
export function brandIconUrl(brand:TenantBrand,size:BrandIconSize){
 return '/api/tenant-brand/icon/'+size+'?rev='+brandIconDigest(brand,size);
}
export function buildTenantManifest(brand:TenantBrand){
 return {
  id:'/',name:brand.appName,short_name:brand.shortName,description:brand.description,lang:'ko',
  start_url:'/',scope:'/',display:'standalone',orientation:'portrait',
  background_color:'#F7F9FD',theme_color:'#FFFFFF',
  icons:([192,512] as const).map(size=>({src:brandIconUrl(brand,size),sizes:size+'x'+size,type:'image/png',purpose:'any'})),
 };
}
/** Metadata only. Authorization and role routing remain separate. */
export function buildTenantMetadata(brand:TenantBrand){
 return {
  title:brand.appName,description:brand.description,manifest:'/api/tenant-brand/manifest',
  icons:{icon:[{url:brandIconUrl(brand,192),type:'image/png'}],apple:[{url:brandIconUrl(brand,192),type:'image/png'}]},
  appleWebApp:{capable:true,statusBarStyle:'default' as const,title:brand.shortName},
 };
}
