import {matchHipassTransactions,type ParsedHipassRow} from './hipassReconciler';
import type {HqBooking} from '../types/hq';
import type {HqDrivingLog} from '../types/drivingLogHq';
import type {HqExpenseRecord} from '../types/expenseHq';

export const hipassOrgValid=(org:unknown):org is string=>typeof org==='string'&&/^[a-z][a-z0-9_]{2,62}$/.test(org);
export function ownsAllHipassSchedules(org:unknown,ids:readonly string[],rows:readonly {id:string;org_id:unknown}[]):boolean{
 if(!hipassOrgValid(org)||ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)return false;
 return rows.length===ids.length&&new Set(rows.map(r=>r.id)).size===rows.length&&rows.every(r=>r.org_id===org&&ids.includes(r.id));
}
type Scoped<T>={orgId:string;record:T};
type Fleet={plate:string;model:string;defaultDriver?:string};
/** Internal candidate. Scope and row tags must come from authenticated
 * server queries, never from the import file or browser. Mixed data fails
 * closed rather than being silently accepted. Existing parser/matcher reused. */
export function matchTenantHipassTransactions(org:unknown,rows:ParsedHipassRow[],source:{
 bookings:readonly Scoped<HqBooking>[];
 drivingLogs:readonly Scoped<HqDrivingLog>[];
 existingExpenses:readonly Scoped<HqExpenseRecord>[];
 fleet:readonly Scoped<Fleet>[];
}){
 if(!hipassOrgValid(org))throw Error('Invalid Hi-Pass scope');
 const owned=<T>(items:readonly Scoped<T>[]):T[]=>{
  if(!Array.isArray(items)||items.some(x=>!x||x.orgId!==org||!x.record))throw Error('Invalid Hi-Pass scope');
  return items.map(x=>x.record);
 };
 return matchHipassTransactions({rows,bookings:owned(source.bookings),drivingLogs:owned(source.drivingLogs),existingExpenses:owned(source.existingExpenses),fleet:owned(source.fleet)});
}
