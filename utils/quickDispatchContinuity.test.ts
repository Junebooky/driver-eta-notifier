import test from 'node:test';
import assert from 'node:assert/strict';
import type { HqBooking } from '../types/hq';
import { editedBookingIdentity } from './quickDispatchContinuity';

const existing = {
  pickupLocation:'인천공항 T1', destination:'서울신라호텔',
  pickupLat:37.46,pickupLng:126.44,destinationLat:37.55,destinationLng:127.01,
  placeVerified:true,intakeSource:'email',
  eventId:'email-nav-123',eventName:'VIP A',groupId:'email-nav-123-2026-11-05',
  groupName:'VIP 그룹',groupTotalVehicles:3,groupVehicleIndex:2,
} as HqBooking;

test('an emailed unassigned group row keeps its source and actual vehicle slot on mobile edit',()=>{
 const m=editedBookingIdentity(existing,'인천공항 T1','서울신라호텔');
 assert.ok(m);
 assert.equal(m.intakeSource,'email');
 assert.equal(m.eventId,'email-nav-123');
 assert.equal(m.groupId,'email-nav-123-2026-11-05');
 assert.equal(m.groupTotalVehicles,3);
 assert.equal(m.groupVehicleIndex,2);
 assert.equal(m.placeVerified,true);
 assert.equal(m.originLat,37.46);
 assert.equal(m.destinationLng,127.01);
});

test('editing a pickup invalidates old verification and coordinates without destroying email identity',()=>{
 const m=editedBookingIdentity(existing,'김포공항 국제선','서울신라호텔');
 assert.ok(m);
 assert.equal(m.placeVerified,false);
 assert.equal(m.originLat,undefined);
 assert.equal(m.originLng,undefined);
 assert.equal(m.destinationLat,37.55);
 assert.equal(m.intakeSource,'email');
 assert.equal(m.groupVehicleIndex,2);
 assert.equal(editedBookingIdentity(null,'서울','인천'),null);
});
