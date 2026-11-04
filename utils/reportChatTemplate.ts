/** Blank driver-authored KakaoTalk report template. No driver values are inferred. */
export function buildDriverReportTemplate(koreanDate:string){
 const [year,month,day]=koreanDate.split('-').map(Number);
 if(!Number.isInteger(year)||!Number.isInteger(month)||!Number.isInteger(day)||year<2000||month<1||month>12||day<1||day>31)
  throw new Error('운행보고 날짜를 확인해 주세요.');
 return [
  year+'년 '+month+'월 '+day+'일',
  '수행담당 : ',
  '차량번호 : ',
  '출      근 : ',
  '고객명 : ',
  '탑승인원 : ',
  '출발지 : ',
  '최종도착지 : ',
  '시작   시간 : ',
  '종료   시간 : ',
  '운행총시간 : ',
  '시작km : ',
  '종료km : ',
  '일일운행합 : ',
  '',
  '운행일지',
  '',
  '',
  '경비지출',
  '통행료 : ',
  '세차비 : ',
  '주차비 : ',
  '주유비 : ',
  '교통비 : ',
  '숙박비 : ',
  '식   비 : ',
  '기   타 : ',
  '합   계 : ',
  '',
  '특이사항',
  '',
  '',
  '퇴근시간 : ',
 ].join('\n');
}
