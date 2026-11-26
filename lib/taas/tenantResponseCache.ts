/** Candidate cache for disposable server responses, not drafts/offline writes.
 * Existing localStorage/IndexedDB and their data are not touched.
 * Only the future authenticated session adapter may activate a lease. This is
 * accidental cross-account isolation, not protection against malicious JS. */
export interface CacheIdentity {
 orgId:string;userId:string;sessionId:string;role:'company_owner'|'company_admin'|'driver';driverId:string|null;hostname:string;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const keyPattern=/^[a-z][a-z0-9_.:-]{0,119}$/;
export function tenantCacheScope(i:CacheIdentity):string|null{
 if(!i||!(/^[a-z][a-z0-9_]{2,62}$/).test(i.orgId)||!uuid.test(i.userId)||!uuid.test(i.sessionId)
 ||!(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/).test(i.hostname)
 ||!['company_owner','company_admin','driver'].includes(i.role)
 ||(i.role==='driver'?!i.driverId||!uuid.test(i.driverId):i.driverId!==null))return null;
 return JSON.stringify([i.hostname,i.orgId,i.userId,i.sessionId,i.role,i.driverId]);
}
export interface CacheLease {
 get<T>(key:string):T|undefined;
 set<T>(key:string,value:T):boolean;
 remove(key:string):boolean;
}
export function createTenantResponseCache(){
 let scope:string|null=null,generation=0;
 const values=new Map<string,string>();
 const clear=()=>{generation++;scope=null;values.clear();};
 return {
  clear,
  activate(i:CacheIdentity):CacheLease|null{
   const next=tenantCacheScope(i);
   if(!next){clear();return null;}
   if(next!==scope){clear();scope=next;}
   const g=generation;
   const current=(key:string)=>scope===next&&generation===g&&keyPattern.test(key);
   return {
    get<T>(key:string):T|undefined{
     if(!current(key))return undefined;
     try{const v=values.get(key);return v===undefined?undefined:JSON.parse(v) as T;}catch{return undefined;}
    },
    set<T>(key:string,value:T):boolean{
     if(!current(key))return false;
     try{const serialized=JSON.stringify(value);if(typeof serialized!=='string')return false;
      values.set(key,serialized);return true;
     }catch{return false;}
    },
    remove(key:string):boolean{return current(key)&&values.delete(key);},
   };
  },
 };
}
