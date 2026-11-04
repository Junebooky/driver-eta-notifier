import {unzipSync,zipSync,strToU8,strFromU8} from 'fflate';
import {DOMParser} from '@xmldom/xmldom';
import {appendKakaoExcelReport,workbookFromFile} from './kakaoExcelWorkbook';
import {EXCEL_COLUMN_LABELS,type KakaoExcelDraft} from './kakaoExcelImport';
import {widenReportColumns,routeColumnWidth} from './reportExcelCellFormatting';
const xml=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
function doc(v:string){if(/<!DOCTYPE|<!ENTITY/i.test(v))throw new Error('지원하지 않는 XML');return new DOMParser({onError:()=>{throw new Error('손상된 XML');}}).parseFromString(v,'application/xml');}
function pathFor(entries:Record<string,Uint8Array>,sheet:string){
 const wb=doc(strFromU8(entries['xl/workbook.xml'])),r=doc(strFromU8(entries['xl/_rels/workbook.xml.rels']));
 const id=Array.from(wb.getElementsByTagName('sheet')).find(s=>s.getAttribute('name')===sheet)?.getAttribute('r:id');
 const target=Array.from(r.getElementsByTagName('Relationship')).find(n=>n.getAttribute('Id')===id)?.getAttribute('Target');
 if(!target||/\.\.|\\/.test(target))throw new Error('시트를 확인해 주세요.');return target.startsWith('/')?target.slice(1):'xl/'+target;
}
const rowRE=(row:number)=>new RegExp(`<row\\b(?=[^>]*\\br="${row}")[^>]*?(?:/>|>[\\s\\S]*?<\\/row>)`);
function clearCells(rowXml:string){return rowXml.replace(/<c\b(?=[^>]*\br="[A-L]\d+")[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g,'');}
export function removeReportRow(bytes:Uint8Array,sheet:string,row:number){
 workbookFromFile(bytes);if(row<2||!Number.isInteger(row))throw new Error('반영 위치가 올바르지 않습니다.');
 const entries=unzipSync(bytes),path=pathFor(entries,sheet),source=strFromU8(entries[path]);
 const match=source.match(rowRE(row));if(!match)throw new Error('기존 반영 행을 찾지 못했습니다.');
 entries[path]=strToU8(source.replace(rowRE(row),clearCells(match[0])));return zipSync(entries);
}
export function amendReportRow(bytes:Uint8Array,sheet:string,row:number,draft:KakaoExcelDraft){
 const cleared=removeReportRow(bytes,sheet,row),out=appendKakaoExcelReport(cleared,draft);
 if(out.sheetName!==sheet)return out; // Old location is cleared; exactly one live record in the new month.
 const before=unzipSync(bytes),after=unzipSync(out.bytes),path=pathFor(after,sheet);
 const source=strFromU8(before[path]),patched=strFromU8(after[path]);
 const addition=patched.match(rowRE(out.rowNumber))?.[0];if(!addition)throw new Error('정정 행 생성 실패');
 const cells=addition.replace(/^<row[^>]*>|<\/row>$/g,'').replace(/r="([A-L])\d+"/g,`r="$1${row}"`);
 const old=source.match(rowRE(row))?.[0];if(!old)throw new Error('정정 위치가 없습니다.');
 const kept=clearCells(old);const replacement=kept.endsWith('/>')?kept.slice(0,-2)+'>'+cells+'</row>':kept.replace('</row>',cells+'</row>');
 // Restore original dimension and all other worksheet contents; only owned A–L cells change.
 after[path]=strToU8(widenReportColumns(source.replace(rowRE(row),replacement),routeColumnWidth([draft.route,...Object.entries(workbookFromFile(bytes).Sheets[sheet].cells).filter(([address])=>/^G[1-9]\d*$/.test(address)&&address!=='G'+row).map(([,cell])=>String(cell.v??''))])));
 return {...out,bytes:zipSync(after),rowNumber:row};
}
/** HQ approves a blank template derived from an existing company month, not its records. */
export function addApprovedMonth(bytes:Uint8Array,sourceMonth:string,targetMonth:number){
 const wb=workbookFromFile(bytes),name=targetMonth+'월';if(targetMonth<1||targetMonth>12||!Number.isInteger(targetMonth))throw new Error('월을 확인해 주세요.');
 if(wb.Sheets[name])return bytes;
 const entries=unzipSync(bytes),sourcePath=pathFor(entries,sourceMonth);let sheet=strFromU8(entries[sourcePath]);
 // Drawings/comments contain old report data and are not portable template content.
 sheet=sheet.replace(/<(?:legacyDrawing|drawing|hyperlinks|extLst)\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:legacyDrawing|drawing|hyperlinks|extLst)>)/g,'');
 const parsed=doc(sheet);for(const node of Array.from(parsed.getElementsByTagName('*')))if(node.hasAttribute('r:id')&&node.tagName!=='pageSetup')throw new Error('이 양식의 외부 연결을 먼저 확인해 주세요.');for(const f of Array.from(parsed.getElementsByTagName('f')))if((f.textContent||'').includes('!')||['shared','array'].includes(f.getAttribute('t')||''))throw new Error('다른 시트를 참조하는 수식이 있습니다. 승인된 독립 양식을 준비해 주세요.');
 sheet=sheet.replace(/<c\b([^>]*\br="([A-Z]+)(\d+)"[^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,(all,attrs,col,r,body='')=>{
  if(Number(r)===1)return all;
  const style=attrs.match(/\bs="\d+"/)?.[0]||'';
  const formula=body.match(/<f\b[^>]*>[\s\S]*?<\/f>/)?.[0]||'';
  return `<c r="${col}${r}" ${style}>${formula}</c>`;
 });
 // A/B legacy numeric values are not column headings. New approved template gets explicit labels.
 const headerStyles=new Map(Array.from(parsed.getElementsByTagName('c')).filter(c=>/^[A-L]1$/.test(c.getAttribute('r')||'')).map(c=>[c.getAttribute('r'),c.getAttribute('s')]));
 const header=EXCEL_COLUMN_LABELS.map((v,i)=>`<c ${headerStyles.get(String.fromCharCode(65+i)+'1')?'s="'+headerStyles.get(String.fromCharCode(65+i)+'1')+'" ':''}r="${String.fromCharCode(65+i)}1" t="inlineStr"><is><t>${xml(v)}</t></is></c>`).join('');
 const first=sheet.match(rowRE(1))?.[0]?.match(/^<row[^>]*>/)?.[0]||'<row r="1">';
 sheet=sheet.replace(rowRE(1),first+header+'</row>');
 let n=1;while(entries[`xl/worksheets/sheet${n}.xml`])n++;
 const newPath=`xl/worksheets/sheet${n}.xml`,relPath=sourcePath.replace('/worksheets/','/worksheets/_rels/')+'.rels';
 if(entries[relPath]){
  const rels=doc(strFromU8(entries[relPath]));
  for(const r of Array.from(rels.getElementsByTagName('Relationship')))if(!r.getAttribute('Type')?.endsWith('/printerSettings'))r.parentNode?.removeChild(r);
  entries[newPath.replace('/worksheets/','/worksheets/_rels/')+'.rels']=strToU8(rels.toString());
 }
 entries[newPath]=strToU8(sheet);
 const workbook=strFromU8(entries['xl/workbook.xml']),rels=strFromU8(entries['xl/_rels/workbook.xml.rels']);
 const ids=Array.from(doc(workbook).getElementsByTagName('sheet')).map(s=>Number(s.getAttribute('sheetId')));
 let rid='reportMonth'+n;while(rels.includes(`Id="${rid}"`))rid+='x';
 let names='';
 const sourceIndex=wb.SheetNames.indexOf(sourceMonth);
 for(const dn of Array.from(doc(workbook).getElementsByTagName('definedName'))){if(Number(dn.getAttribute('localSheetId'))!==sourceIndex||!['_xlnm.Print_Area','_xlnm.Print_Titles'].includes(dn.getAttribute('name')||''))continue;const formula=(dn.textContent||'').replaceAll("'"+sourceMonth+"'!","'"+name+"'!").replaceAll(sourceMonth+'!',name+'!');names+=`<definedName name="${dn.getAttribute('name')}" localSheetId="${wb.SheetNames.length}">${xml(formula)}</definedName>`;}
 const withNames=names?workbook.replace('</definedNames>',names+'</definedNames>'):workbook;
 entries['xl/workbook.xml']=strToU8(withNames.replace('</sheets>',`<sheet name="${name}" sheetId="${Math.max(...ids)+1}" r:id="${rid}"/></sheets>`));
 entries['xl/_rels/workbook.xml.rels']=strToU8(rels.replace('</Relationships>',`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/></Relationships>`));
 const types=strFromU8(entries['[Content_Types].xml']);entries['[Content_Types].xml']=strToU8(types.replace('</Types>',`<Override PartName="/${newPath}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`));
 const result=zipSync(entries);workbookFromFile(result);return result;
}

/**
 * For a reported month that is not in the annual workbook, copy the nearest
 * existing monthly SHEET as a *blank* template. Prefer the most recent earlier
 * month (e.g. October -> November); otherwise use the earliest later month.
 * Do not copy customer records or invent an annual workbook.
 *
 * A separately approved source month, when present, always takes precedence.
 * The caller commits the new month + submitted report together through the
 * existing version compare-and-swap transaction (no half-created month).
 */
export function ensureReportMonth(bytes:Uint8Array,targetMonth:number,approvedSourceMonth?:string){
 if(!Number.isInteger(targetMonth)||targetMonth<1||targetMonth>12)throw new Error('운행보고의 월을 확인해 주세요.');
 const wb=workbookFromFile(bytes),month=targetMonth+'월';
 if(wb.Sheets[month])return {bytes,created:false,sourceMonth:null as string|null};
 const months=wb.SheetNames.map(name=>{
  const m=name.match(/^(1[0-2]|[1-9])월$/);
  return m?{name,number:Number(m[1])}:null;
 }).filter((x):x is {name:string;number:number}=>x!==null).sort((a,b)=>a.number-b.number);
 if(!months.length)throw new Error('월별 시트가 없는 Excel 원본입니다. HQ에서 월별 양식을 먼저 등록해 주세요.');
 const source=approvedSourceMonth??([...months].reverse().find(m=>m.number<targetMonth)??months.find(m=>m.number>targetMonth))?.name;
 if(!source||!wb.Sheets[source])throw new Error('자동생성에 사용할 기존 월별 양식이 없습니다. HQ에서 확인해 주세요.');
 // addApprovedMonth clears ALL prior report values before creating the new sheet.
 // Unsupported formulas or external references fail closed rather than corrupt data.
 const next=addApprovedMonth(bytes,source,targetMonth);
 return {bytes:next,created:true,sourceMonth:source};
}

/** Download presentation copy: refit G for every existing month without touching
 * the immutable stored workbook/version. Version and original downloads remain exact. */
export function refitWorkbookRouteColumns(bytes:Uint8Array){
 const book=workbookFromFile(bytes);
 const entries=unzipSync(bytes);let modified=false;
 for(const month of book.SheetNames.filter(name=>/^(?:[1-9]|1[0-2])월$/.test(name))){
  const path=pathFor(entries,month),source=strFromU8(entries[path]);
  const routes=Object.entries(book.Sheets[month].cells).filter(([address])=>/^G[1-9]\d*$/.test(address)).map(([,cell])=>String(cell.v??''));
  const fitted=widenReportColumns(source,routeColumnWidth(routes));
  if(fitted!==source){entries[path]=strToU8(fitted);modified=true;}
 }
 if(!modified)return bytes;
 const output=zipSync(entries,{level:6});
 workbookFromFile(output);
 return output;
}
