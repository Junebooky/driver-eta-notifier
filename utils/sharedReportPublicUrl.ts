/** The publicly reachable Vercel report entry point. Do not use window.location.origin:
 * HQ often runs on localhost or a preview with authentication protection. */
export const DEFAULT_SHARED_REPORT_ORIGIN='https://driver-eta-notifier-git-feat-driver-4af899-junebookys-projects.vercel.app';

export function sharedReportPublicUrl(path:string,configuredOrigin?:string):string{
 if(!/^\/report#key=[A-Za-z0-9_-]{43}$/.test(path))throw new Error('공용 보고 링크 주소 형식을 확인해 주세요.');
 const candidate=(configuredOrigin||DEFAULT_SHARED_REPORT_ORIGIN).trim();
 let base:URL;
 try{base=new URL(candidate);}catch{throw new Error('공용 보고 외부 주소 설정이 올바르지 않습니다.');}
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||
    base.search||base.hash||base.port||!base.hostname){
  throw new Error('공용 보고 외부 주소는 HTTPS 도메인만 입력할 수 있습니다.');
 }
 return base.origin+path;
}
