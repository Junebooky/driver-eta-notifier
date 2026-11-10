import type { AnalyzedScheduleAttachment } from '@/services/emailAttachmentIntake';
import type { HqEmailExtractedDraft } from '@/types/emailHq';

export interface EmailDocumentCoverage {
  sourceId: string;
  reviewedSheets: string[];
  scheduleDates: string[];
  missingDates?: string[];
}

/** Only explicit date labels from a Date row/column, never title date ranges. */
export function scheduleHeaderDate(label: string, referenceYear: number): string | undefined {
  const text = label.trim();
  let year = referenceYear, month = 0, day = 0;
  const numeric = text.match(/^(?:(\d{4})[-/.년]\s*)?(\d{1,2})[-/.월]\s*(\d{1,2})(?:일)?(?:\s*\([^)]*\))?$/);
  const english = text.match(/^(?:(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\s+)?(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/i);
  if (numeric) { year = Number(numeric[1] || year); month = Number(numeric[2]); day = Number(numeric[3]); }
  else if (english) {
    month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(english[1].slice(0,3).toLowerCase()) + 1;
    day = Number(english[2]); year = Number(english[3] || year);
  } else return undefined;
  const value = new Date(Date.UTC(year, month - 1, day));
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return undefined;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

export function attachmentManifest(files: AnalyzedScheduleAttachment[], referenceYear: number) {
  return files.map((file, index) => ({
    sourceId: `attachment-${index + 1}`, filename: file.filename, kind: file.kind,
    sheets: (file.sheets || []).filter(sheet => sheet.nonEmptyRows > 0).map(sheet => ({
      name: sheet.name,
      datesToReview: [...new Set(sheet.dateLabels.map(label => scheduleHeaderDate(label, referenceYear)).filter((date): date is string => Boolean(date)))],
    })),
  }));
}

/** A successful API call is not proof that every document reached the draft. */
export function verifyAttachmentCoverage(
  files: AnalyzedScheduleAttachment[], rawCoverage: unknown,
  draft: Pick<HqEmailExtractedDraft, 'pickupDate' | 'waypoints' | 'vehicleRoutes'>, referenceYear: number,
): EmailDocumentCoverage[] {
  if (!files.length) return [];
  const coverage = Array.isArray(rawCoverage) ? rawCoverage as Partial<EmailDocumentCoverage>[] : [];
  const resultDates = new Set([draft.pickupDate, ...(draft.waypoints || []).map(point => point.date || ''), ...(draft.vehicleRoutes || []).map(route => route.date)]);
  const verified: EmailDocumentCoverage[] = [];
  for (const source of attachmentManifest(files, referenceYear)) {
    const matches = coverage.filter(item => item?.sourceId === source.sourceId);
    const item = matches[0];
    if (matches.length !== 1 || !Array.isArray(item?.reviewedSheets) || !Array.isArray(item?.scheduleDates) ||
        !item.reviewedSheets.every(value => typeof value === 'string') ||
        !item.scheduleDates.every(value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))) {
      throw new Error(`${source.filename}: 첨부파일 분석 내역이 누락됐습니다. 전체 일정으로 다시 분석해 주세요.`);
    }
    const missingSheets = source.sheets.filter(sheet => !item.reviewedSheets!.includes(sheet.name));
    if (missingSheets.length) throw new Error(`${source.filename}: ${missingSheets.map(sheet => sheet.name).join(', ')} 시트 분석이 누락됐습니다. 다시 분석해 주세요.`);
    const headerDates = source.sheets.flatMap(sheet => sheet.datesToReview);
    const missingDates = [...new Set([...headerDates, ...item.scheduleDates])].filter(date => !resultDates.has(date));
    verified.push({ sourceId: source.sourceId, reviewedSheets: [...item.reviewedSheets], scheduleDates: [...item.scheduleDates], ...(missingDates.length ? { missingDates } : {}) });
  }
  return verified;
}

/** Date headers can be empty, cancelled or travel-only days. Retain the draft
 * for human review; absence is not proof that a ground trip must be invented. */
export function pendingAttachmentDateReviews(draft: Pick<HqEmailExtractedDraft, 'documentAnalysis'>) {
  return (draft.documentAnalysis || []).filter(file => file.missingDates?.length && !file.dateReviewAcknowledged);
}

export function assertAttachmentDatesReviewed(draft: Pick<HqEmailExtractedDraft, 'documentAnalysis'>) {
  if (pendingAttachmentDateReviews(draft).length) throw new Error('첨부파일의 확인 필요 날짜를 원본과 비교한 뒤 검토 완료를 눌러 주세요.');
}
