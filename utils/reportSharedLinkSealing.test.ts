import test from 'node:test';
import assert from 'node:assert/strict';
import {newDeviceSecret,tokenHash} from '../lib/driverDevices/tokens';
import {sealSharedReportToken,openSharedReportToken,extractSharedReportToken} from '../lib/driverReports/sharedLinkSealing';

test('HQ server can recover sealed link from encrypted storage, not from wrong hash or tampered text',()=>{
 const before=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.SUPABASE_SERVICE_ROLE_KEY='qa-only-placeholder-for-local-encryption-tests';
 try{
  const token=newDeviceSecret(),sealed=sealSharedReportToken(token);
  assert.notEqual(sealed,token);
  assert.equal(sealed.includes(token),false);
  assert.equal(openSharedReportToken(sealed,tokenHash(token)),token);
  assert.equal(openSharedReportToken(sealed,tokenHash(newDeviceSecret())),null);
  assert.equal(openSharedReportToken(sealed+'.tampered',tokenHash(token)),null);
  const parts=sealed.split('.');
  parts[2]=(parts[2][0]==='a'?'b':'a')+parts[2].slice(1);
  assert.equal(openSharedReportToken(parts.join('.'),tokenHash(token)),null);
  assert.equal(extractSharedReportToken('https://example.vercel.app/report#key='+token),token);
  assert.equal(extractSharedReportToken(token),token);
  assert.equal(extractSharedReportToken('http://example.vercel.app/report#key='+token),null);
 }finally{
  if(before===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY=before;
 }
});
