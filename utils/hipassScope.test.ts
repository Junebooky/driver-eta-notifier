import test from 'node:test';
import assert from 'node:assert/strict';
import {ownsAllHipassSchedules,matchTenantHipassTransactions} from './hipassScope';
import {parseHipassText,matchHipassTransactions} from './hipassReconciler';
import {VIP_REAL_VEHICLES} from './vehicleData';
import type {HqBooking} from '../types/hq';
import type {HqExpenseRecord} from '../types/expenseHq';
const vip='vip_limousine_korea',ch='chauffeur_service';
test('preflight requires the entire requested set to be owned by verified organization',()=>{
 assert.equal(ownsAllHipassSchedules(ch,['a','b'],[{id:'a',org_id:ch},{id:'b',org_id:ch}]),true);
 for(const rows of [[{id:'a',org_id:ch}],[{id:'a',org_id:ch},{id:'b',org_id:vip}],[{id:'a',org_id:ch},{id:'a',org_id:ch}],[{id:'a',org_id:ch},{id:'c',org_id:ch}]]){
  assert.equal(ownsAllHipassSchedules(ch,['a','b'],rows),false);
 }
 assert.equal(ownsAllHipassSchedules('',[],[]),false);
});
test('new tenant with empty fleet never falls back to VIP, existing legacy caller unchanged',()=>{
 const plate=VIP_REAL_VEHICLES[0].plate;
 const rows=parseHipassText('거래일시,차량번호,출구영업소,통행금액\n2027-01-12 09:00,'+plate+',서울TG,8000').rows;
 assert.equal(rows.length,1);
 const empty={bookings:[],drivingLogs:[],existingExpenses:[],fleet:[]};
 assert.equal(matchHipassTransactions({rows,bookings:[],drivingLogs:[],existingExpenses:[]})[0].matchStatus,'vehicle_only');
 assert.equal(matchTenantHipassTransactions(ch,rows,empty)[0].matchStatus,'unmatched');
 const own={...empty,fleet:[{orgId:ch,record:{plate,model:'fixture van'}}]};
 assert.equal(matchTenantHipassTransactions(ch,rows,own)[0].matchStatus,'vehicle_only');
 assert.throws(()=>matchTenantHipassTransactions(ch,rows,{...own,fleet:[{orgId:vip,record:{plate,model:'foreign'}}]}),/scope/);
 const booking={id:'a',pickupDate:'2027-01-12',pickupTime:'08:00',vehiclePlate:plate,dispatchStatus:'배차 완료',driverName:'fixture'} as HqBooking;
 assert.throws(()=>matchTenantHipassTransactions(ch,rows,{...own,bookings:[{orgId:vip,record:booking}]}),/scope/);
 assert.equal(matchTenantHipassTransactions(ch,rows,{...own,bookings:[{orgId:ch,record:booking}]})[0].matchedScheduleId,'a');
 const expense={hipassTxKey:rows[0].hipassTxKey,category:'toll',vehiclePlate:plate,rawDate:rows[0].rawDate,time:rows[0].time,amount:8000} as HqExpenseRecord;
 assert.equal(matchTenantHipassTransactions(ch,rows,{...own,existingExpenses:[{orgId:ch,record:expense}]})[0].isDuplicate,true);
 assert.throws(()=>matchTenantHipassTransactions(ch,rows,{...own,existingExpenses:[{orgId:vip,record:expense}]}),/scope/);
});
