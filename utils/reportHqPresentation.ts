import type {ReportChatMessage,ReportExcelStatus} from '@/types/driverReportChat';

/**
 * HQ presents only two decision states without changing the durable
 * background queue's pending/review/error/applied statuses.
 */
export type ReportHqFilter='all'|'applied'|'review';
export function reportDisplayStatus(value:ReportExcelStatus):'반영 완료'|'확인 필요'{
 return value==='applied'?'반영 완료':'확인 필요';
}
export function reportMatchesFilter(status:ReportExcelStatus,filter:ReportHqFilter):boolean{
 return filter==='all'||(filter==='applied'?status==='applied':status!=='applied');
}
/** Keep all original report content in storage, but exclude canned responses from HQ detail UI. */
export function visibleHqReportMessages(messages:ReportChatMessage[]):ReportChatMessage[]{
 return messages.filter(message=>message.sender_type!=='system');
}
