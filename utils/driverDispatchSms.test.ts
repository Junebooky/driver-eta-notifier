import test from 'node:test';
import assert from 'node:assert/strict';
import {driverDispatchSmsHref} from './driverDispatchSms';

const booking={
 driverPhone:'010-1234-5678', pickupDate:'2026-11-05',pickupTime:'09:00',
 pickupLocation:'인천공항 T1',destination:'서울신라호텔',vehiclePlate:'193호 5336',
};
test('HQ mobile creates a native driver-only SMS draft without sending it',()=>{
 const href=driverDispatchSmsHref(booking);
 assert.ok(href?.startsWith('sms:01012345678?body='));
 const body=decodeURIComponent(href!.split('?body=')[1]);
 assert.match(body,/2026-11-05 09:00/);
 assert.match(body,/기사 Cockpit에서 배차 내용을 확인/);
 assert.ok(!body.includes('010-1234-5678'));
});
test('missing, placeholder and invalid phone numbers never open an SMS composer',()=>{
 assert.equal(driverDispatchSmsHref({...booking,driverPhone:'010-0000-0000'}),null);
 assert.equal(driverDispatchSmsHref({...booking,driverPhone:undefined}),null);
 assert.equal(driverDispatchSmsHref({...booking,driverPhone:'010;rm -rf'}),null);
});
