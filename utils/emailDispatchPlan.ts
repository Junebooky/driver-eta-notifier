import type { HqEmailExtractedDraft,RouteWaypointItem } from '@/types/emailHq';
import { VIP_REAL_VEHICLES } from './vehicleData';
import { normalizeDateToIso,normalizeTimeHHmm } from './dispatchConflictDetector';
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
export function buildEmailDispatchPlan(draft:HqEmailExtractedDraft,slots:Array<{vehicleModel:string;vehiclePlate?:string;driver:{id:string;name:string;phone?:string}|null}>,status:'published'|'unassigned'){
 if(draft.tripType==='group' && draft.groupTrips?.length)throw new Error('탑승객별 별도 일정은 각 예약에서 확인한 뒤 배차해 주세요. 첫 일정만 배차하지 않습니다.');
 if(!slots.length)throw new Error('요청 차량을 추가해 주세요.');
 return emailDispatchDays(draft).flatMap(day=>{
  if(!normalizeDateToIso(day.date)||day.points.length<2||!normalizeTimeHHmm(day.start.time || '')||!day.start.location||!day.end.location)throw new Error(`${day.date}: 출발·도착지와 실제 시작 시간을 확인해 주세요.`);
  if(status==='published' && (!normalizeTimeHHmm(day.endTime)||day.endTime<=day.start.time!))throw new Error(`${day.date}: 실제 종료 시간을 확인해 주세요.`);
  const confirmed=day.points.every(p=>p.isPoiConfirmed&&Number.isFinite(p.lat)&&Number.isFinite(p.lng));
  if(status==='published'&&!confirmed)throw new Error(`${day.date}: 모든 경유지의 위치 후보를 확정해 주세요.`);
  return slots.map((slot,index)=>{
   if(status==='published'&&(!slot.driver?.id||!slot.vehiclePlate))throw new Error('각 차량 슬롯의 기사와 실제 차량 번호판을 모두 선택해 주세요.');
   return {scheduleId:draft.savedScheduleIds?.[`${day.date}:${index}`],date:day.date,endDate:day.date,pickupTime:day.start.time!,endTime:day.endTime||undefined,origin:day.start.location,originLat:day.start.lat,originLng:day.start.lng,destination:day.end.location,destinationLat:day.end.lat,destinationLng:day.end.lng,routeWaypoints:day.points,
    customerName:draft.companyName,customerId:draft.clientId || undefined,passengerName:draft.passengerName,passengerPhone:draft.passengerPhone,passengerCount:draft.passengerCount,flightNumber:draft.flightNumber,notes:draft.specialRequests,
    eventId:`email-${draft.emailId}`,eventName:draft.companyName,groupId:`email-${draft.emailId}-${day.date}`,groupVehicleIndex:index+1,groupTotalVehicles:slots.length,
    vehicleModel:status==='published'?(VIP_REAL_VEHICLES.find(vehicle=>vehicle.plate===slot.vehiclePlate)?.model || slot.vehicleModel):slot.vehicleModel,vehiclePlate:status==='published'?slot.vehiclePlate:undefined,driverId:status==='published'?slot.driver?.id:undefined,driverName:status==='published'?slot.driver?.name:undefined,driverPhone:status==='published'?slot.driver?.phone:undefined,
    dispatchStatus:status,intakeSource:'email' as const,placeVerified:confirmed,allowUnverified:status==='unassigned'};
  });
 });
}
