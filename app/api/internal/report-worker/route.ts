import {timingSafeEqual} from 'node:crypto';
import {runReportWorker} from '@/lib/driverReports/service';
import {privateJson} from '@/lib/driverReports/http';
export const maxDuration=60;
export async function GET(req:Request){
 const configured=process.env.CRON_SECRET;const received=req.headers.get('authorization')||'';
 if(!configured||configured.length<32||received.length!==configured.length+7||!timingSafeEqual(Buffer.from(received),Buffer.from('Bearer '+configured)))return privateJson({ok:false},401);
 try{return privateJson({ok:true,claimed:await runReportWorker()});}catch{return privateJson({ok:false,error:'작업자 연결을 확인해 주세요.'},503);}
}
