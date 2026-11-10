import {timingSafeEqual} from 'node:crypto';
import {runReportWorker} from '@/lib/driverReports/service';
import {privateJson} from '@/lib/driverReports/http';
export const maxDuration=60;
export async function GET(req:Request){
 const configured=process.env.CRON_SECRET;const received=req.headers.get('authorization')||'';
 const actual=Buffer.from(received),expected=Buffer.from('Bearer '+(configured||''));
 if(!configured||configured.length<32||actual.length!==expected.length||!timingSafeEqual(actual,expected))return privateJson({ok:false},401);
 try{return privateJson({ok:true,claimed:await runReportWorker()});}catch{return privateJson({ok:false,error:'작업자 연결을 확인해 주세요.'},503);}
}
