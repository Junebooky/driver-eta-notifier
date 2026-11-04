import {parseKakaoExcelReport,normalizedPlate,validateKakaoExcelDraft,checkedTime} from './kakaoExcelImport';
import {VIP_REAL_VEHICLES} from './vehicleData';
import type {ParsedDriverReport} from '@/types/driverReportChat';

export const koreaDate = (now=new Date()) => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function workMinutes(start:string,end:string,nightEndHour=6) {
  if(!checkedTime(start)||!checkedTime(end)) return null;
  const min=(v:string)=>Number(v.split(':')[0])*60+Number(v.split(':')[1]);
  const a=min(start),b=min(end);if(b<=a||b-a>24*60)return null;
  let night=0,ot=0;
  for(let m=a;m<b;m++) {
    // Night: 22:00–06:00, including the following day; never also counted as OT.
    if(m%1440>=22*60 || m%1440<nightEndHour*60)night++;
    else if(m>=a+600)ot++;
  }
  return {total:b-a,ot,night};
}
const duration=(m:number)=>[Math.floor(m/60)?`${Math.floor(m/60)}시간`:'',m%60?`${m%60}분`:''].filter(Boolean).join(' ');
export function standardVehicleModel(model:string) {
  if(/스프린터/.test(model))return /519/.test(model)?'스프린터 519':/투어러/.test(model)?'스프린터 투어러 319':'스프린터 319';
  if(/스타리아/.test(model))return '스타리아';
  if(/카니발/.test(model))return /하이/.test(model)?'카니발 하이리무진':'카니발 리무진';
  return model.replace(/^(제네시스|벤츠|현대|기아)\s*/,'');
}
export function routeFromDiary(raw:string) {
  const diary=raw.match(/운행일지\s*[:：]?\s*\n([\s\S]*?)(?=\n\s*(?:경비지출|특이사항)|$)/)?.[1]||'';
  return diary.split(/→|➡|->|\n/).map(p=>p.replace(/\d{1,2}:\d{2}/g,'').replace(/\/?\s*업무\s*종료/g,'').replace(/^[\s·•\-]+|[\s/]+$/g,'').trim()).filter(p=>p&&!/^(경비지출|특이사항)/.test(p)).join(' - ');
}
export function parseDriverReport(raw:string,driverName?:string,now=new Date(),options:{workbookYear?:number|null;nightEndHour?:number}={}):ParsedDriverReport {
  const result=parseKakaoExcelReport(raw,options.workbookYear??Number(koreaDate(now).slice(0,4)));
  const draft={...result.draft};const reviewReasons:string[]=[];
  const exact=VIP_REAL_VEHICLES.find(v=>normalizedPlate(v.plate)===normalizedPlate(draft.plate));
  const suffix=/^\d{4}$/.test(draft.plate.trim())?VIP_REAL_VEHICLES.filter(v=>v.plateShort===draft.plate.trim()):[];
  const vehicle=exact||(suffix.length===1?suffix[0]:undefined);
  if(vehicle){draft.plate=vehicle.plate;draft.model=standardVehicleModel(vehicle.model);}
  else reviewReasons.push('차량번호를 확인해 주세요.');
  if(driverName&&draft.driver.replace(/\s/g,'')!==driverName.replace(/\s/g,''))reviewReasons.push('로그인한 기사명과 보고서 수행담당이 다릅니다.');
  const diary=routeFromDiary(raw);if(diary)draft.route=diary;
  if(!draft.route)reviewReasons.push('운행 경로를 확인해 주세요.');
  // A missing year may cross a year boundary: hold for HQ instead of silently posting.
  if(!/20\d{2}\s*년/.test(raw)&&!options.workbookYear)reviewReasons.push('보고 연도를 확인해 주세요.');
  if(result.warnings.some(w=>w.includes('운행총시간과')))reviewReasons.push('보고된 총시간과 시작·종료가 다릅니다. 확인해 주세요.');
  reviewReasons.push(...validateKakaoExcelDraft(draft));
  const times=draft.time.match(/^(\d{2}:\d{2})~(\d{2}:\d{2})$/);
  const work=times?workMinutes(times[1],times[2],options.nightEndHour??6):null;
  if(!work)reviewReasons.push('근무 시작·종료 및 익일 시각을 확인해 주세요.');
  draft.overtime=work?[work.ot?`OT ${duration(work.ot)}`:'',work.night?`심야 ${duration(work.night)}`:''].filter(Boolean).join(' / '):'';
  return {draft,vehicleUuid:vehicle?.uuid||null,totalWorkMinutes:work?.total??null,otMinutes:work?.ot||0,nightMinutes:work?.night||0,warnings:result.warnings,reviewReasons:[...new Set(reviewReasons)]};
}
export function reportReply(parsed:ParsedDriverReport) {
  if(parsed.reviewReasons.length)return '오늘도 수고 많으셨어요.\n보내주신 내용 중 확인할 항목이 있어요. 담당자가 확인할게요.';
  return '오늘도 수고 많으셨어요.\n운행보고 잘 받았습니다. 감사합니다 ^.^';
}
