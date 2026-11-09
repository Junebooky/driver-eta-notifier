import type { HqEmailExtractedDraft,RouteWaypointItem } from '@/types/emailHq';
import { assertAttachmentDatesReviewed } from './emailAttachmentCoverage';
import { VIP_REAL_VEHICLES } from './vehicleData';
import { normalizeDateToIso,normalizeTimeHHmm } from './dispatchConflictDetector';
import { buildAirportArrivalPickupGroups } from './emailBookingEvidence';
/**
 * HQ flight-to-vehicle assignment identity: a flight can only be identified
 * within its service date. Never infer the assigned driver from the order of
 * people listed in an email.
 */
export function emailFlightKey(flight:{date:string;flightNumber:string}):string{
 return flight.date+':'+flight.flightNumber.replace(/[\s-]/g,'').toUpperCase();
}
export function emailAssignableFlights(draft:HqEmailExtractedDraft){
 const groups=new Map<string,NonNullable<HqEmailExtractedDraft['flights']>[number]>();
 for(const f of draft.flights || []){
  if(!f.flightNumber?.trim() || f.role==='connection')continue;
  const key=emailFlightKey(f);
  const existing=groups.get(key);
  if(!existing){groups.set(key,{...f,passengers:[...(f.passengers || [])]});continue;}
  groups.set(key,{...existing,passengers:[...new Set([...(existing.passengers || []),...(f.passengers || [])].map(x=>x.trim()).filter(Boolean))]});
 }
 return [...groups.values()];
}
export type EmailFlightSlot={assignedFlightKeys?:string[]};
/** Returns manager-visible validation problems; publishing fails closed. */
export function emailFlightAssignmentIssues(
 draft:HqEmailExtractedDraft,
 slots:EmailFlightSlot[],
):string[]{
 if(slots.length<=1)return [];
 const flights=emailAssignableFlights(draft);
 if(!flights.length)return [];
 const valid=new Set(flights.map(emailFlightKey));
 const problems:string[]=[];
 for(const [index,slot] of slots.entries()){
  for(const key of slot.assignedFlightKeys || [])if(!valid.has(key))
   problems.push(index+1+'호차에 현재 이메일에 없는 항공편 배정이 남아 있습니다.');
 }
 const dates=[...new Set(flights.map(f=>f.date))];
 for(const date of dates){
  const dayFlights=flights.filter(f=>f.date===date);
  const passengerOwners=new Map<string,number>();
  for(const flight of dayFlights){
   const key=emailFlightKey(flight);
   const selected=slots.flatMap((slot,i)=>(slot.assignedFlightKeys || []).includes(key)?[i]:[]);
   if(selected.length!==1){
    problems.push(date+' '+flight.flightNumber+': 담당 차량을 정확히 하나 선택해 주세요.');
    continue;
   }
   const people=[...new Set((flight.passengers || []).map(n=>n.trim()).filter(Boolean))];
   if(!people.length)problems.push(date+' '+flight.flightNumber+': 탑승객 이름을 확인해 주세요.');
   for(const name of people){
    const normalized=name.toLocaleLowerCase();
    const owner=passengerOwners.get(normalized);
    if(owner!==undefined&&owner!==selected[0])
     problems.push(date+' '+name+': 여러 차량에 중복 배정된 승객입니다.');
    passengerOwners.set(normalized,selected[0]);
   }
  }
  for(const [i,slot] of slots.entries()){
   if(!dayFlights.some(f=>(slot.assignedFlightKeys || []).includes(emailFlightKey(f))))
    problems.push(date+' '+(i+1)+'호차: 맡을 항공편이 없습니다. 운행하지 않는 차량은 별도 일정에서 제외해 주세요.');
  }
 }
 return [...new Set(problems)];
}

export function emailDispatchDays(draft:HqEmailExtractedDraft){
 const hasMultipleDates=(draft.waypoints || []).some(point=>point.date && point.date!==draft.pickupDate);
 const groups=new Map<string,RouteWaypointItem[]>();
 for(const point of [...(draft.waypoints || [])].sort((a,b)=>a.order-b.order)){
  const date=point.date || (hasMultipleDates?'':draft.pickupDate);
  if(!normalizeDateToIso(date))throw new Error('경로의 날짜를 YYYY-MM-DD로 확인해 주세요. 날짜를 추정해서 배차하지 않습니다.');
  groups.set(date,[...(groups.get(date)||[]),point]);
 }
 if(!groups.size){groups.set(draft.pickupDate,[{id:'pickup',order:1,date:draft.pickupDate,time:draft.pickupTime,location:draft.pickupLocation,lat:draft.pickupLat,lng:draft.pickupLng,isPoiConfirmed:draft.isPickupPoiConfirmed},{id:'dropoff',order:2,date:draft.pickupDate,location:draft.dropoffLocation,lat:draft.dropoffLat,lng:draft.dropoffLng,isPoiConfirmed:draft.isDropoffPoiConfirmed}]);}
 return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date,points])=>({date,points,start:points[0],end:points[points.length-1],endTime:draft.dayEndTimes?.[date] || points[points.length-1].time || ''}));
}
export function buildEmailDispatchPlan(draft:HqEmailExtractedDraft,slots:Array<{vehicleModel:string;vehiclePlate?:string;driver:{id:string;name:string;phone?:string;languages?:string[];englishAvailable?:boolean}|null;assignedFlightKeys?:string[]}>,status:'published'|'unassigned'){
 assertAttachmentDatesReviewed(draft);
 const assignmentIssues=status==='published'?emailFlightAssignmentIssues(draft,slots):[];
 if(assignmentIssues.length)throw new Error(assignmentIssues[0]);
 const requestedLanguage = draft.requestedLanguage || (/영어|english|외국인/i.test(draft.specialRequests || '') ? 'en' : 'ko');
 if(draft.tripType==='group' && draft.groupTrips?.length)throw new Error('탑승객별 별도 일정은 각 예약에서 확인한 뒤 배차해 주세요. 첫 일정만 배차하지 않습니다.');
 if(!slots.length)throw new Error('요청 차량을 추가해 주세요.');
 return emailDispatchDays(draft).flatMap(day=>{
  if(!normalizeDateToIso(day.date)||day.points.length<2||!normalizeTimeHHmm(day.start.time || '')||!day.start.location||!day.end.location)throw new Error(`${day.date}: 출발·도착지와 실제 시작 시간을 확인해 주세요.`);
  if(status==='published' && (!normalizeTimeHHmm(day.endTime)||day.endTime<=day.start.time!))throw new Error(`${day.date}: 실제 종료 시간을 확인해 주세요.`);
  const dayFlights=emailAssignableFlights(draft).filter(f=>f.date===day.date);
  const splitByFlight=status==='published' && slots.length>1 && dayFlights.length>0;
  // Flight assignments are scoped inside each vehicle row; no shared roster.
  const perSlotFlights=(slot:{assignedFlightKeys?:string[]})=>splitByFlight
    ?dayFlights.filter(f=>(slot.assignedFlightKeys || []).includes(emailFlightKey(f)))
    :dayFlights;
  const arrivalNotes=(flights:typeof dayFlights)=> {
    const byAirport=new Map<string,ReturnType<typeof buildAirportArrivalPickupGroups>>();
    for(const group of buildAirportArrivalPickupGroups(flights)){
      const list=byAirport.get(group.airport)||[];
      byAirport.set(group.airport,[...list,group]);
    }
    return [...byAirport.values()].filter(groups=>groups.length>1).map(groups=>
      '공항 입국 그룹별 픽업: '+groups.map(group=>
        group.sequence+'차 '+group.flightNumber+' 도착 '+(group.arrivalTime||'시간 미정')+
        (group.passengers.length?' ('+group.passengers.join(', ')+')':'')
      ).join(' / ')+' · 전원 합류 후 이동'
    ).join(' · ');
  };
  const confirmed=day.points.every(p=>p.isPoiConfirmed&&Number.isFinite(p.lat)&&Number.isFinite(p.lng));
  if(status==='published'&&!confirmed)throw new Error(`${day.date}: 모든 경유지의 위치 후보를 확정해 주세요.`);
  return slots.map((slot,index)=>{
   if(status==='published'&&(!slot.driver?.id||!slot.vehiclePlate))throw new Error('각 차량 슬롯의 기사와 실제 차량 번호판을 모두 선택해 주세요.');
   if(status==='published'&&requestedLanguage==='en' && !(slot.driver?.englishAvailable || slot.driver?.languages?.some(l=>l.toLowerCase()==='en'||l.toLowerCase()==='english'||l.includes('영어'))))throw new Error('영어 가능 조건에 맞는 기사를 선택해 주세요.');
   const assignedFlights=perSlotFlights(slot);
   const selectedPassengers=[...new Set(assignedFlights.flatMap(f=>(f.passengers||[]).map(name=>name.trim()).filter(Boolean)))];
   const foreignFlights=splitByFlight?dayFlights.filter(f=>!assignedFlights.some(selected=>emailFlightKey(selected)===emailFlightKey(f))):[];
   const foreignLabels=foreignFlights.flatMap(f=>[f.flightNumber,...(f.passengers || [])])
     .map(label=>label.trim().toLocaleLowerCase()).filter(label=>label.length>=3);
   const mentionsOtherGroup=(text:string)=>foreignLabels.some(label=>text.toLocaleLowerCase().includes(label));
   const safeCommonNotes=splitByFlight && mentionsOtherGroup(draft.specialRequests || '')
     ? '공통 특이사항에 다른 탑승객 정보가 있어 HQ 원본 확인 필요'
     : draft.specialRequests;
   const groupNotes=arrivalNotes(assignedFlights);
   const combinedNotes=[safeCommonNotes,groupNotes].filter(Boolean).join(' · ');
   const routeWaypoints=day.points.map(point=>{
     // AI enrichment adds an all-flights roster to the airport stop. Remove
     // that shared roster, then insert only this assigned vehicle's group.
     const original=point.notes || '';
     const groupIndex=original.indexOf('입국 그룹별 픽업');
     let safe=groupIndex>=0?original.slice(0,groupIndex).replace(/[·•\s]+$/,'').trim():original;
     if(splitByFlight && mentionsOtherGroup(safe))safe='해당 장소의 원본 메모는 HQ 확인 필요';
     if(groupIndex>=0){
       const local=buildAirportArrivalPickupGroups(assignedFlights).filter(g=>
         (g.airport==='GMP'&&/김포|gimpo/i.test(point.location)) ||
         (g.airport==='ICN'&&/인천|incheon/i.test(point.location)) ||
         (g.airport==='PUS'&&/김해|gimhae/i.test(point.location)) ||
         (g.airport==='CJU'&&/제주|jeju/i.test(point.location)));
       if(local.length>0)safe=[safe,'입국 그룹별 픽업 · '+local.map(g=>
         g.sequence+'차 '+g.flightNumber+' '+(g.arrivalTime||'도착시각 미정')+
         (g.passengers.length?' ('+g.passengers.join(', ')+')':'')).join(' / ')
       ].filter(Boolean).join(' · ');
     }
     return {...point,notes:safe||undefined};
   });
   return {scheduleId:draft.savedScheduleIds?.[`${day.date}:${index}`],date:day.date,endDate:day.date,pickupTime:day.start.time!,endTime:day.endTime||undefined,origin:day.start.location,originLat:day.start.lat,originLng:day.start.lng,destination:day.end.location,destinationLat:day.end.lat,destinationLng:day.end.lng,routeWaypoints,
    customerName:draft.companyName,customerId:draft.clientId || undefined,passengerName:splitByFlight?selectedPassengers.join(', '):draft.passengerName,passengerPhone:splitByFlight?'':draft.passengerPhone,passengerCount:splitByFlight?selectedPassengers.length:draft.passengerCount,flightNumber:assignedFlights.map(f=>f.flightNumber).join(', ') || (!splitByFlight && day.date===draft.pickupDate ? draft.flightNumber : ''),notes:combinedNotes,
    eventId:`email-${draft.emailId}`,eventName:draft.eventName?.trim() || draft.companyName || '',groupId:`email-${draft.emailId}-${day.date}`,groupVehicleIndex:index+1,groupTotalVehicles:slots.length,
    vehicleModel:status==='published'?(VIP_REAL_VEHICLES.find(vehicle=>vehicle.plate===slot.vehiclePlate)?.model || slot.vehicleModel):slot.vehicleModel,vehiclePlate:status==='published'?slot.vehiclePlate:undefined,driverId:status==='published'?slot.driver?.id:undefined,driverName:status==='published'?slot.driver?.name:undefined,driverPhone:status==='published'?slot.driver?.phone:undefined,
    dispatchStatus:status,intakeSource:'email' as const,requestedLanguage,placeVerified:confirmed,allowUnverified:status==='unassigned'};
  });
 });
}

/** Confirmation is complete only when every saved row has the assigned driver's current-version acknowledgment. */
export function emailDispatchProgress(ids:string[],rows:Array<{id:string;dispatch_status?:string;isAcknowledged?:boolean;last_ack_version?:number;version?:number}>){
 const unique=new Set(ids);const matched=rows.filter(row=>unique.has(row.id));
 const confirmed=new Set(matched.filter(row=>row.dispatch_status==='published'&&row.isAcknowledged===true&&Number.isInteger(row.version)&&row.last_ack_version===row.version).map(row=>row.id)).size;
 return {expected:unique.size,confirmed,complete:unique.size>0&&confirmed===unique.size};
}
