import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {tokenHash,validSecret} from '@/lib/driverDevices/tokens';

/**
 * AES-256-GCM at rest, using a purpose-separated derivation of the existing
 * private Supabase service role key. No new Vercel secret or raw-token logging.
 * Service key rotation will require reissuing saved links.
 */
function key(){
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!secret||secret==='unconfigured-server-key')throw new Error('링크 보관용 서버 키가 설정되지 않았습니다.');
 return createHash('sha256').update('cockpit:shared-report:v1\0').update(secret).digest();
}
export function sealSharedReportToken(token:string){
 if(!validSecret(token))throw new Error('운행보고 링크를 확인해 주세요.');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
 const encrypted=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
 return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}
export function openSharedReportToken(sealed:string,expectedHash:string){
 if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(sealed))return null;
 try{
  const [ivRaw,tagRaw,cipherRaw]=sealed.split('.');
  const iv=Buffer.from(ivRaw,'base64url'),tag=Buffer.from(tagRaw,'base64url');
  if(iv.length!==12||tag.length!==16||!/^[0-9a-f]{64}$/.test(expectedHash))return null;
  const decipher=createDecipheriv('aes-256-gcm',key(),iv);
  decipher.setAuthTag(tag);
  const token=Buffer.concat([decipher.update(Buffer.from(cipherRaw,'base64url')),decipher.final()]).toString('utf8');
  const a=Buffer.from(tokenHash(token),'hex'),b=Buffer.from(expectedHash,'hex');
  return validSecret(token)&&timingSafeEqual(a,b)?token:null;
 }catch{return null;}
}
export function extractSharedReportToken(input:string){
 const trimmed=input.trim();
 if(validSecret(trimmed))return trimmed;
 try{
  const url=new URL(trimmed);
  if(!/^https:$/.test(url.protocol))return null;
  const token=new URLSearchParams(url.hash.replace(/^#/,'')).get('key');
  return validSecret(token)?token:null;
 }catch{return null;}
}
