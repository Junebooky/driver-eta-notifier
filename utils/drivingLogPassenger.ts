/** The driver's profile is the single editable source for the active passenger.
 * Never mistake a passenger name for the booking's customer/company name.
 * Count is reported only when explicitly expressed in the profile text. */
export function passengerSummaryFromProfile(value: string | null | undefined): {passengerName: string; passengerCount: string} {
 const passengerName=(value||'').trim();
 if(!passengerName)return {passengerName:'',passengerCount:''};
 const others=passengerName.match(/외\s*(\d{1,2})\s*명/);
 const total=passengerName.match(/총\s*(\d{1,2})\s*명/) ||
   passengerName.match(/\(\s*(\d{1,2})\s*명\s*\)/) ||
   passengerName.match(/^(\d{1,2})\s*명$/);
 const count=others ? Number(others[1])+1 : total ? Number(total[1]) : undefined;
 return {passengerName,passengerCount:count && count<=99 ? `${count}명` : ''};
}

/** Sync only editable drafts. A submitted log is an immutable snapshot of that day. */
export function withCurrentProfilePassenger<T extends {status:'draft'|'submitted';passengerName?:string;passengerCount:string;isDemoFixture?:boolean}>(
 log:T, passengerName:string|null|undefined,
):T {
 if(log.status!=='draft'||log.isDemoFixture)return log;
 return {...log,...passengerSummaryFromProfile(passengerName)};
}
