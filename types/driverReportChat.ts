import type {KakaoExcelDraft} from '@/utils/kakaoExcelImport';
export type ReportExcelStatus = 'pending' | 'applied' | 'review' | 'error';
export interface ReportChatMessage {
  id:string; seq:number; sender_type:'driver'|'system'|'hq'; message_type:'text'|'status'|'error';
  body:string; linked_submission_id:string|null; created_at:string;
}
export interface ParsedDriverReport {
  draft:KakaoExcelDraft; vehicleUuid:string|null; totalWorkMinutes:number|null;
  otMinutes:number; nightMinutes:number; warnings:string[]; reviewReasons:string[];
}
export interface DriverReportSubmission {
  id:string; seq:number; driver_id:string; raw_message:string; parsed:ParsedDriverReport;
  excel_status:ReportExcelStatus; review_status:'pending'|'approved'|'not_required';
  excel_sheet_name:string|null; excel_row_number:number|null; submitted_at:string; revision:number;
  last_error:string|null;
}
