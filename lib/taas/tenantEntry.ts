import {canonicalTenantHostname,type TenantIdentity} from '../auth/tenantIdentity';
import {brandIconUrl,buildTenantMetadata,parseTenantBrand,type TenantBrand} from './tenantBranding';
import type {TenantFeaturePolicy} from './tenantFeatures';
import type {TenantPresentation} from '../../components/taas/TenantPresentation';

type Home='/'|'/hq?tab=dashboard';
type Result=
 |{kind:'unavailable'}
 |{kind:'login';brand:TenantBrand;presentation:TenantPresentation;metadata:ReturnType<typeof buildTenantMetadata>}
 |{kind:'authorized';brand:TenantBrand;presentation:TenantPresentation;metadata:ReturnType<typeof buildTenantMetadata>;home:Home;role:TenantIdentity['role']};
export type TenantEntryDependencies={
 // Both functions independently verify the same trusted ingress hostname.
 brand:(trustedHost:string)=>Promise<TenantBrand|null>;
 verify:(trustedHost:string,token:string)=>Promise<TenantIdentity|null>;
 features?:(trustedHost:string,token:string)=>Promise<TenantFeaturePolicy|null>;
};
export function tenantPresentation(brand:TenantBrand):TenantPresentation{
 return {displayName:brand.displayName,appName:brand.appName,iconUrl:brandIconUrl(brand,192),legacyReportExcel:false};
}
/** No Host header/forwarded header/query parsing here. The caller MUST be a
 * trusted ingress adapter; a client-supplied host or role is never authority.
 * Missing brand or inconsistent identity never falls back to VIP. */
export async function resolveTenantEntry(trustedHost:string,token:string|null,deps:TenantEntryDependencies):Promise<Result>{
 const host=canonicalTenantHostname(trustedHost);if(!host)return {kind:'unavailable'};
 try{
  const brand=parseTenantBrand(host,await deps.brand(host));if(!brand)return {kind:'unavailable'};
  const common={brand,presentation:tenantPresentation(brand),metadata:buildTenantMetadata(brand)};
  if(!token)return {kind:'login',...common};
  const i=await deps.verify(host,token);
  if(!i)return {kind:'login',...common};
  if(i.hostname!==host||i.orgId!==brand.orgId)return {kind:'unavailable'};
  if(deps.features){const policy=await deps.features(host,token);if(!policy)return {kind:'unavailable'};common.presentation.legacyReportExcel=brand.orgId==='vip_limousine_korea'&&policy.legacyReportExcel;}
  if(i.role==='driver'&&typeof i.driverId==='string'&&i.driverId&&i.home==='/')return {kind:'authorized',...common,home:'/',role:i.role};
  if((i.role==='company_owner'||i.role==='company_admin')&&i.driverId===null&&i.home==='/hq?tab=dashboard')return {kind:'authorized',...common,home:'/hq?tab=dashboard',role:i.role};
  return {kind:'unavailable'};
 }catch{return {kind:'unavailable'};}
}
/** Only root/login and the two existing app destinations are in this first
 * candidate. No open redirect, report-device or legacy representative bypass. */
export function tenantEntryDestination(entry:Result,path:string):string|null{
 if(entry.kind==='unavailable')return null;
 if(!['/','/login','/hq','/hq?tab=dashboard'].includes(path))return null;
 if(entry.kind==='login')return '/login';
 return entry.home;
}
