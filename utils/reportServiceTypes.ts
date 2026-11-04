/** The only allowed values for the existing workbook H column. */
export const REPORT_SERVICE_TYPES=['김포공항 샌딩','인천공항 샌딩','의전'] as const;
export type ReportServiceType=(typeof REPORT_SERVICE_TYPES)[number];
export function isReportServiceType(value:unknown):value is ReportServiceType{
 return typeof value==='string'&&(REPORT_SERVICE_TYPES as readonly string[]).includes(value);
}
