import test from 'node:test';
import assert from 'node:assert/strict';
import {passengerSummaryFromProfile,withCurrentProfilePassenger} from './drivingLogPassenger';

test('profile passenger name is authoritative and explicit companion count includes lead passenger',()=>{
 assert.deepEqual(passengerSummaryFromProfile('SOFYAN 외 1명 (TARA SOFYAN)'),{passengerName:'SOFYAN 외 1명 (TARA SOFYAN)',passengerCount:'2명'});
 assert.deepEqual(passengerSummaryFromProfile('홍길동 외 8명'),{passengerName:'홍길동 외 8명',passengerCount:'9명'});
 assert.deepEqual(passengerSummaryFromProfile('VIP (총 7명)'),{passengerName:'VIP (총 7명)',passengerCount:'7명'});
 assert.deepEqual(passengerSummaryFromProfile('SOFYAN'),{passengerName:'SOFYAN',passengerCount:''});
 assert.deepEqual(passengerSummaryFromProfile(null),{passengerName:'',passengerCount:''});
});
test('changing profile passenger refreshes draft, never submitted historical report',()=>{
 const draft={status:'draft' as const,clientName:'인터코스',passengerName:'old',passengerCount:'9명',notes:'계기판 그대로'};
 const current=withCurrentProfilePassenger(draft,'New VIP 외 1명');
 assert.equal(current.clientName,'인터코스');
 assert.equal(current.passengerName,'New VIP 외 1명');
 assert.equal(current.passengerCount,'2명');
 assert.equal(current.notes,'계기판 그대로');
 const staleCount=withCurrentProfilePassenger(current,'VIP New');
 assert.equal(staleCount.passengerCount,'');
 const submitted=withCurrentProfilePassenger({...draft,status:'submitted' as const},'Another VIP');
 assert.equal(submitted.passengerName,'old');
 assert.equal(submitted.passengerCount,'9명');
 const fixture=withCurrentProfilePassenger({...draft,isDemoFixture:true},'Another VIP');
 assert.equal(fixture.passengerName,'old');
});
