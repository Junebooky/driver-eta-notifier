// Synthetic OOXML fixture: no customer data or company workbook is committed.
import { zipSync, strToU8 } from 'fflate';
export function kakaoWorkbookFixture(): Uint8Array {
  const s=(r:string,v:string)=>`<c r="${r}" t="inlineStr"><is><t>${v}</t></is></c>`;
  const entries:Record<string,string>={
    '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="4月" sheetId="1" r:id="rId1"/><sheet name="4월" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet2.xml"/><Relationship Id="rId2" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/styles.xml':'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml':`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:L244"/><cols><col min="1" max="1" width="22" customWidth="1"/></cols><sheetData><row r="1"><c r="A1"><v>45184</v></c><c r="B1"><v>7725</v></c></row><row r="2">${s('A2','4/1~30')}${s('B2','1458')}${s('D2','다른 거래처')}${s('E2','다른 기사')}${s('F2','11(13:20~24:20)')}</row><row r="3"><c r="A3" s="1"><v>46113</v></c>${s('B3','703서2660/2874')}${s('D3','기존 거래처')}${s('E3','기존 기사')}${s('F3','17:30~24:20')}</row><row r="113"><c r="L113"><f>SUM(J2:J112)*1.1</f><v>0</v></c></row><row r="244">${s('B244','원본 비표준 메모')}</row></sheetData><mergeCells count="1"><mergeCell ref="A241:L241"/></mergeCells></worksheet>`,
    'xl/worksheets/sheet2.xml':'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:L1"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>보존 탭</t></is></c></row></sheetData></worksheet>',
    'customXml/item1.xml':'<custom>opaque metadata</custom>',
  };
  return zipSync(Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,strToU8(v)])));
}
