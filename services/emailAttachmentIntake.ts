import { createHash } from 'node:crypto';
import { read, utils } from 'xlsx';
import { unzipSync } from 'fflate';
import { extractExcelCalendarBlocks, type ExcelCalendarBlock } from '@/utils/emailCalendarGrid';

export const MAX_EMAIL_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_EMAIL_ATTACHMENT_TOTAL_BYTES = 12 * 1024 * 1024;
export const MAX_EMAIL_SCHEDULE_ATTACHMENTS = 4;

export interface ScheduleAttachmentInput {
  filename: string;
  contentType: string;
  content: Buffer;
}
export interface AnalyzedScheduleAttachment {
  filename: string;
  kind: 'excel' | 'pdf' | 'docx';
  sha256: string;
  size: number;
  /** Excel cell text only; PDFs are passed to Gemini as PDF inline data. */
  text?: string;
  pdfBase64?: string;
  sheets?: Array<{ name: string; nonEmptyRows: number; dateLabels: string[] }>;
  calendarBlocks?: ExcelCalendarBlock[];
}
export interface AttachmentAnalysis {
  analyzed: AnalyzedScheduleAttachment[];
  ignored: string[];
}

/** Validate MIME by content signature, never only by sender-controlled extension. */
export function analyzeScheduleAttachments(attachments: ScheduleAttachmentInput[]): AttachmentAnalysis {
  const analyzed: AnalyzedScheduleAttachment[] = [];
  const ignored: string[] = [];
  if (attachments.length > 20) throw new Error('첨부파일이 너무 많습니다. 필요한 일정표만 별도로 보내 주세요.');
  let totalBytes = 0;
  for (const file of attachments) {
    const name = file.filename.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 160) || '이름 없는 첨부파일';
    const ext = name.toLowerCase().match(/\.(xlsx|xls|pdf|docx)$/)?.[1];
    if (!ext) { ignored.push(name); continue; }
    const bytes = file.content;
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_EMAIL_ATTACHMENT_BYTES) {
      throw new Error(`${name}: 파일 크기는 8MB 이하여야 합니다.`);
    }
    totalBytes += bytes.length;
    if (totalBytes > MAX_EMAIL_ATTACHMENT_TOTAL_BYTES || analyzed.length >= MAX_EMAIL_SCHEDULE_ATTACHMENTS) {
      throw new Error('분석할 일정표는 최대 4개이며 전체 12MB 이하여야 합니다.');
    }
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (ext === 'pdf') {
      if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new Error(`${name}: 올바른 PDF 파일이 아닙니다.`);
      }
      analyzed.push({ filename: name, kind: 'pdf', sha256: digest, size: bytes.length, pdfBase64: bytes.toString('base64') });
      continue;
    }
    const isZip = bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const isXls = bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    if (ext === 'docx') {
      if (!isZip) {
        throw new Error(`${name}: 확장자와 실제 Word(DOCX) 형식이 일치하지 않습니다.`);
      }
      let docXml = '';
      try {
        const unzipped = unzipSync(bytes, {
          filter: (entry) => entry.name === 'word/document.xml',
        });
        const docBytes = unzipped['word/document.xml'];
        if (docBytes) {
          docXml = new TextDecoder('utf-8').decode(docBytes);
        }
      } catch (zipErr) {
        throw new Error(`${name}: Word 문서 압축 해제 실패 — ${zipErr instanceof Error ? zipErr.message : ''}`);
      }
      if (!docXml) {
        throw new Error(`${name}: Word 문서 본문(document.xml)을 찾을 수 없습니다.`);
      }
      const text = docXml
        .replace(/<w:p[^>]*>/g, '\n')
        .replace(/<w:tab[^>]*\/>/g, '\t')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();
      if (!text) {
        throw new Error(`${name}: Word 문서에 읽을 수 있는 텍스트가 없습니다.`);
      }
      analyzed.push({
        filename: name,
        kind: 'docx',
        sha256: digest,
        size: bytes.length,
        text: `\n[Word ${name}]\n${text}\n`,
      });
      continue;
    }
    if ((ext === 'xlsx' && !isZip) || (ext === 'xls' && !isXls)) {
      throw new Error(`${name}: 확장자와 실제 Excel 형식이 일치하지 않습니다.`);
    }
    if (isZip) {
      let expanded = 0;
      unzipSync(bytes, { filter: entry => {
        expanded += entry.originalSize;
        if (expanded > 48 * 1024 * 1024) throw new Error(`${name}: 압축 해제 크기가 너무 큽니다.`);
        return false;
      }});
    }
    try {
      // Bounded parsing: reject oversized/ambiguous documents instead of silently truncating a route.
      const book = read(bytes, { type: 'buffer', sheetRows: 1502, cellDates: false, bookVBA: false });
      if (book.SheetNames.length > 12) throw new Error('시트가 12개를 초과합니다.');
      let text = '';
      let nonEmptyCells = 0;
      const sheets: NonNullable<AnalyzedScheduleAttachment['sheets']> = [];
      const calendarBlocks: ExcelCalendarBlock[] = [];
      for (const sheetName of book.SheetNames) {
        const sheet = book.Sheets[sheetName];
        const rows = utils.sheet_to_json<Array<string | number>>(sheet, { header: 1, raw: false, defval: '', blankrows: true });
        const firstRow = sheet['!ref'] ? utils.decode_range(sheet['!ref']).s.r : 0;
        const firstCol = sheet['!ref'] ? utils.decode_range(sheet['!ref']).s.c : 0;
        calendarBlocks.push(...extractExcelCalendarBlocks(sheetName, rows, firstRow, firstCol));
        if (rows.length >= 1502) throw new Error('시트당 1500행을 초과합니다.');
        text += `\n[Excel ${name} / Sheet: ${sheetName}]\n`;
        const dateLabels: string[] = [];
        let dateColumn = -1;
        let nonEmptyRows = 0;
        for (const [rowIndex, row] of rows.entries()) {
          if (row.length > 60) throw new Error('표가 60열을 초과합니다.');
          const headerIndex = row.findIndex(val => /^(date|날짜|일자|일시)$/i.test(String(val).trim()));
          if (headerIndex >= 0) {
            dateColumn = headerIndex;
            dateLabels.push(...row.filter((_, col) => col !== headerIndex).map(String));
          } else if (dateColumn >= 0 && row[dateColumn] !== '') dateLabels.push(String(row[dateColumn] || ''));
          const cells = row.map((val, col) => {
            if (val === '') return '';
            const value = String(val);
            if (value.length > 4000) throw new Error('셀 내용이 너무 깁니다.');
            nonEmptyCells++;
            return `${col + 1}:${value.replace(/[\r\n\t]+/g, ' ')} [${utils.encode_cell({ r: firstRow + rowIndex, c: firstCol + col })}]`;
          }).filter(Boolean);
          if (cells.length) { nonEmptyRows++; text += `행 ${firstRow + rowIndex + 1} | ${cells.join(' | ')}\n`; }
          if (text.length > 100_000) throw new Error('일정표 텍스트가 너무 깁니다.');
        }
        // Calendar schedules put days across columns and time down rows. Retain
        // the anchor/range instead of flattening a merged appointment into a list.
        const merges = sheet['!merges'] || [];
        if (merges.length > 1500) throw new Error('병합 셀이 너무 많습니다.');
        if (merges.length) text += `병합 셀: ${merges.map(range => utils.encode_range(range)).join(', ')}\n`;
        if (text.length > 100_000) throw new Error('일정표 텍스트가 너무 깁니다.');
        sheets.push({ name: sheetName, nonEmptyRows, dateLabels: [...new Set(dateLabels)] });
      }
      if (!nonEmptyCells) throw new Error('읽을 수 있는 셀이 없습니다.');
      analyzed.push({ filename: name, kind: 'excel', sha256: digest, size: bytes.length, text, sheets, calendarBlocks });
    } catch (error) {
      throw new Error(`${name}: Excel 분석 실패 — ${error instanceof Error ? error.message : '문서 구조를 확인해 주세요.'}`);
    }
  }
  return { analyzed, ignored };
}
