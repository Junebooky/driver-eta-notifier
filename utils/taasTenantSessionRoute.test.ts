import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {GET,POST} from '../app/api/tenant/auth/session/route';
test('mounted candidate endpoint remains locked, spoofed forwarded headers cannot enable it',async()=>{
 const url='https://chauffeur.example.test/api/tenant/auth/session';
 const headers={origin:'https://chauffeur.example.test','x-forwarded-host':'chauffeur.example.test','x-forwarded-for':'192.0.2.1',host:'chauffeur.example.test'};
 for(const r of [await GET(new NextRequest(url,{headers})),await POST(new NextRequest(url,{method:'POST',headers,body:JSON.stringify({action:'refresh'})}))]){
  assert.equal(r.status,503);assert.equal(r.cookies.getAll().length,0);assert.match(r.headers.get('cache-control')||'',/no-store/);
 }
});
