import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SHARED_REPORT_ORIGIN,sharedReportPublicUrl} from './sharedReportPublicUrl';

const token='A'.repeat(43);
const path='/report#key='+token;

test('localhost HQ emits the same public report link as a hosted HQ, without leaking localhost',()=>{
 const link=sharedReportPublicUrl(path);
 assert.equal(link,DEFAULT_SHARED_REPORT_ORIGIN+path);
 assert.ok(link.startsWith('https://'));
 assert.equal(link.includes('localhost'),false);
 assert.equal(link.split('#key=')[1],token);
});
test('public report origin can be changed independently of HQ origin',()=>{
 assert.equal(sharedReportPublicUrl(path,'https://reports.example.com'), 'https://reports.example.com'+path);
});
test('public report URL rejects unsafe hosts and malformed token paths',()=>{
 for(const invalid of ['http://localhost:3000','http://example.com','https://example.com/report','https://example.com?redirect=x','https://user:pass@example.com','https://example.com:8443']){
  assert.throws(()=>sharedReportPublicUrl(path,invalid));
 }
 for(const invalid of ['/report','/report#key=x','//example.com/report#key='+token,'/report#key='+token+'&next=evil']){
  assert.throws(()=>sharedReportPublicUrl(invalid));
 }
});
