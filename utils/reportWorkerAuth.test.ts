import test from 'node:test';import assert from 'node:assert/strict';
import {GET} from '../app/api/internal/report-worker/route';import {supabaseAdmin as db} from '../lib/supabase/server';
test('worker requires an independent scheduler secret, never a user cookie',async()=>{
 const previous=process.env.CRON_SECRET,rpc=db.rpc;
 try{process.env.CRON_SECRET='isolated-scheduler-test-secret-32-characters';
 assert.equal((await GET(new Request('http://localhost/api/internal/report-worker'))).status,401);
 assert.equal((await GET(new Request('http://localhost/api/internal/report-worker',{headers:{cookie:'cockpit_session=anything',authorization:'Bearer invalid'}}))).status,401);
 db.rpc=(async(name:string)=>({data:name==='claim_report_jobs'?[]:null,error:null})) as unknown as typeof db.rpc;
 assert.equal((await GET(new Request('http://localhost/api/internal/report-worker',{headers:{authorization:'Bearer '+process.env.CRON_SECRET}}))).status,200);
 }finally{db.rpc=rpc;if(previous===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previous;}
});
