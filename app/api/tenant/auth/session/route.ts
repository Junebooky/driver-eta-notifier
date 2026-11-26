import {NextRequest,NextResponse} from 'next/server';
import {loginTenantSessionCandidate,readTenantSessionCandidate,refreshTenantSessionCandidate,logoutTenantSessionCandidate} from '@/lib/auth/tenantSession.server';
import {TENANT_ACCESS_COOKIE,TENANT_BINDING_COOKIE,TENANT_REFRESH_COOKIE,TENANT_REFRESH_BINDING_COOKIE} from '@/lib/auth/tenantSession';

export const dynamic='force-dynamic';
export const runtime='nodejs';
type Ingress={host:string;ip:string};
// Intentionally locked until deployment-specific ingress provenance and domain
// allowlist are verified. Never promote Host/X-Forwarded-* to trusted input.
async function verifiedIngress(_req:NextRequest):Promise<Ingress|null>{return null;}
const unavailable=()=>NextResponse.json({ok:false,authenticated:false,error:'업체 로그인 연동 준비 중입니다.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
const cookies=(req:NextRequest)=>({access:req.cookies.get(TENANT_ACCESS_COOKIE)?.value,binding:req.cookies.get(TENANT_BINDING_COOKIE)?.value,refresh:req.cookies.get(TENANT_REFRESH_COOKIE)?.value,refreshBinding:req.cookies.get(TENANT_REFRESH_BINDING_COOKIE)?.value});
export async function GET(req:NextRequest){
 const ingress=await verifiedIngress(req);return ingress?readTenantSessionCandidate(ingress.host,cookies(req)):unavailable();
}
export async function POST(req:NextRequest){
 const ingress=await verifiedIngress(req);if(!ingress)return unavailable();
 const origin=req.headers.get('origin');
 if(origin!=='https://'+ingress.host)return NextResponse.json({ok:false},{status:403,headers:{'Cache-Control':'no-store'}});
 const raw=await req.text();if(raw.length>8192)return NextResponse.json({ok:false},{status:400});
 let body:Record<string,unknown>;
 try{body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error('invalid');}catch{return NextResponse.json({ok:false},{status:400});}
 if(body.action==='refresh'||body.action==='logout'){
  if(Object.keys(body).length!==1)return NextResponse.json({ok:false},{status:400});
  return body.action==='refresh'?refreshTenantSessionCandidate(ingress.host,origin,cookies(req)):logoutTenantSessionCandidate(ingress.host,origin,cookies(req));
 }
 return loginTenantSessionCandidate(ingress.host,ingress.ip,origin,body);
}
