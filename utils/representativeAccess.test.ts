import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessPortal, loginDestination } from './loginPortal';

test('representative access requires HQ authority and the trusted representative marker',()=>{
  assert.equal(canAccessPortal({role:'hq_admin',isRepresentative:true},'representative'),true);
  assert.equal(canAccessPortal({role:'hq_admin'},'representative'),false);
  assert.equal(canAccessPortal({role:'driver',isRepresentative:true},'representative'),false);
  assert.equal(canAccessPortal({role:'hq_admin'},'driver'),false);
  assert.equal(canAccessPortal({role:'driver'},'hq'),false);
});
test('login returns to an authorized local destination and blocks cross-portal/open redirect loops',()=>{
  const rep={role:'hq_admin',isRepresentative:true},admin={role:'hq_admin'},driver={role:'driver'};
  assert.equal(loginDestination(rep),'/representative');
  assert.equal(loginDestination(admin),'/hq?tab=dashboard');
  assert.equal(loginDestination(driver),'/');
  assert.equal(loginDestination(rep,'/representative?tab=dispatch&view=action'),'/representative?tab=dispatch&view=action');
  assert.equal(loginDestination(admin,'/representative'),'/hq?tab=dashboard');
  assert.equal(loginDestination(driver,'/hq?tab=dispatch'),'/');
  for(const path of ['https://evil.invalid','//evil.invalid','/\\evil.invalid','/login','/representative/login'])assert.equal(loginDestination(rep,path),'/representative');
});
