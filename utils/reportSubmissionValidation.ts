export type ReportInputCheck={accepted:boolean;needsTemplate:boolean;reply:string;missing:string[]};
const LABELS=[
 ['수행담당',/^[ \t]*수행\s*담당[ \t]*[:：][ \t]*(\S[^\r\n]*)[ \t]*$/m],
 ['차량번호',/^[ \t]*차량\s*번호[ \t]*[:：][ \t]*(\S[^\r\n]*)[ \t]*$/m],
 ['고객명',/^[ \t]*고객명[ \t]*[:：][ \t]*(\S[^\r\n]*)[ \t]*$/m],
 ['시작 시간',/^[ \t]*시작\s*시간[ \t]*[:：][ \t]*(\S[^\r\n]*)[ \t]*$/m],
 ['종료 시간',/^[ \t]*종료\s*시간[ \t]*[:：][ \t]*(\S[^\r\n]*)[ \t]*$/m]
] as const;
const SIMPLE='운행보고 양식에 맞춰 작성해 주세요.\n아래 + 버튼에서 보고 양식을 불러올 수 있어요.';

/**
 * Low-cost first gate BEFORE reading or writing any report database rows.
 * A complete report need not fill every optional expense/odometer field.
 * It DOES need a date, identity, vehicle, customer, service times and
 * at least two meaningful diary stops. Partial templates are not reports.
 */
export function validateReportInput(raw:string):ReportInputCheck{
 const text=raw.replace(/\r/g,'').trim();
 const missing:string[]=[];
 const anyReportField=/(?:수행\s*담당|차량\s*번호|고객명|시작\s*시간|종료\s*시간|운행일지)\s*[:：\n]/m.test(text);
 if(!/(?:20\d{2}\s*년\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일/.test(text))missing.push('날짜');
 for(const [label,pattern] of LABELS)if(!pattern.test(text))missing.push(label);
 // Inspect ONLY lines between the 운행일지 and next section heading.
 // A blank template must not count expense/notes headings as route stops.
 const diaryStart=/^[ \t]*운행일지[ \t]*[:：]?[ \t]*$/m.exec(text);
 const diaryBody=diaryStart?text.slice(diaryStart.index+diaryStart[0].length).replace(/^\n/,'')
  .split(/^[ \t]*(?:경비[ \t]*지출|특이[ \t]*사항|퇴근[ \t]*시간)[ \t]*(?:[:：][^\n]*)?$/m)[0].trim():'';
 const stops=diaryBody.split(/(?:→|➡|➔|⇒|->|\n)/)
  .map(s=>s.replace(/^\s*\d{1,2}:\d{2}\s*/,'').replace(/\s*\/\s*(?:업무\s*종료|종료)\s*$/,'').trim())
  .filter(Boolean);
 if(!diaryStart||stops.length<2||stops.some(s=>!/[\p{L}0-9]/u.test(s)))missing.push('운행일지(경유지 2곳 이상)');
 if(!missing.length)return {accepted:true,needsTemplate:false,reply:'',missing:[]};
 const detail=anyReportField?'필요한 항목: '+missing.slice(0,7).join(' · ')+(missing.length>7?' 외':'')+'\n':'';
 return {accepted:false,needsTemplate:true,missing,reply:detail+SIMPLE};
}
