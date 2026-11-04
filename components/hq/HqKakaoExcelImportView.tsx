'use client';
import {HqSharedReportLink} from '@/components/hq/HqSharedReportLink';
import {HqDriverReportInbox} from '@/components/hq/HqDriverReportInbox';

/** The legacy PC-local Excel file editor is retired.
 * HQ now uses the registered server workbook and automatic report ingestion. */
export function HqKakaoExcelImportView(){
 return <div className="mx-auto w-full min-w-0 max-w-5xl space-y-5">
  <HqSharedReportLink/>
  <HqDriverReportInbox/>
 </div>;
}
