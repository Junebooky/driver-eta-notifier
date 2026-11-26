import {supabaseAdmin} from '../supabase/server';
import {verifyTenantAuthCandidate} from '../auth/tenantAuthCandidate.server';
import type {TenantIdentity} from '../auth/tenantIdentity';

export type RegistryKind='driver'|'vehicle'|'customer'|'supplier';
export type RegistryCommand=
 | {kind:RegistryKind;op:'list';cursor?:string;limit?:number}
 | {kind:RegistryKind;op:'create';requestId:string;fields:Record<string,unknown>}
 | {kind:RegistryKind;op:'update';requestId:string;id:string;revision:string;fields:Record<string,unknown>};
export type RegistryResult={ok:true;data:unknown}|{ok:false;status:number;error:string};
export type RegistryDependencies={
 verify:(trustedHost:string,token:string)=>Promise<TenantIdentity|null>;
 call:(identity:TenantIdentity,command:RegistryCommand)=>Promise<{data:unknown;error:{code?:string}|null}>;
};
const fail=(status:number,error:string):RegistryResult=>({ok:false,status,error});

/** Internal candidate for the existing HQ handlers, not a public route.
 * Only the verified identity supplies organization, user and session.
 * Never expose raw DB errors or fall back to global/VIP reads.
 */
export async function runTenantRegistry(trustedHost:string,token:string,command:RegistryCommand,deps:RegistryDependencies):Promise<RegistryResult>{
 try{
  const identity=await deps.verify(trustedHost,token);
  if(!identity||!['company_owner','company_admin'].includes(identity.role))return fail(403,'접근 권한이 없습니다.');
  const {data,error}=await deps.call(identity,command);
  if(error){
   if(error.code==='42501')return fail(403,'접근 권한이 없거나 항목을 찾을 수 없습니다.');
   if(error.code==='40001'||error.code==='23505')return fail(409,'정보가 변경되었거나 등록할 수 없습니다. 다시 확인해 주세요.');
   if(error.code==='22023'||error.code==='23514'||error.code==='22P02')return fail(400,'입력 정보를 확인해 주세요.');
   return fail(503,'관리 정보를 처리할 수 없습니다.');
  }
  return {ok:true,data};
 }catch{return fail(503,'관리 정보를 처리할 수 없습니다.');}
}
export function tenantRegistryCandidate(trustedHost:string,token:string,command:RegistryCommand){
 return runTenantRegistry(trustedHost,token,command,{
  verify:verifyTenantAuthCandidate,
  async call(identity,cmd){
   return supabaseAdmin.rpc('tenant_registry_v1',{p_org:identity.orgId,p_user:identity.userId,p_session:identity.sessionId,p_command:cmd});
  },
 });
}
