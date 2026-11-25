import {parseDiaryRoute} from './reportDiaryRoute';
import {reportFieldValues} from './reportFieldLabels';
export type ReportInputCheck={accepted:boolean;needsTemplate:boolean;reply:string;missing:string[]};
const LABELS=['수행담당','차량번호','고객명','시작 시간','종료 시간'] as const;
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
 const fields=LABELS.map(label=>({label,values:reportFieldValues(text,label)}));
 const diary=parseDiaryRoute(text);
 const anyReportField=fields.some(field=>field.values.length>0)||diary.present;
 if(!/(?:20\d{2}\s*년\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일/.test(text))missing.push('날짜');
 for(const {label,values} of fields)if(!values.some(Boolean))missing.push(label);
 // Use the same parser as the Excel writer; a valid 2-stop diary cannot be
 // rejected merely for writing >, standalone -, or explicit next-day times.
 const stops=diary.stops.map(stop=>stop.place);
 if(!diary.present||stops.length<2||stops.some(stop=>!/[\p{L}0-9]/u.test(stop)))missing.push('운행일지(경유지 2곳 이상)');
 if(!missing.length)return {accepted:true,needsTemplate:false,reply:'',missing:[]};
 const detail=anyReportField?'필요한 항목: '+missing.slice(0,7).join(' · ')+(missing.length>7?' 외':'')+'\n':'';
 return {accepted:false,needsTemplate:true,missing,reply:detail+SIMPLE};
}
