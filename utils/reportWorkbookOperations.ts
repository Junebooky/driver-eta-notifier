import {unzipSync,zipSync,strToU8,strFromU8} from 'fflate';
import {DOMParser} from '@xmldom/xmldom';
import {appendKakaoExcelReport,workbookFromFile} from './kakaoExcelWorkbook';
import {EXCEL_COLUMN_LABELS,type KakaoExcelDraft} from './kakaoExcelImport';
const xml=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
function doc(v:string){if(/<!DOCTYPE|<!ENTITY/i.test(v))throw new Error('지원하지 않는 XML');return new DOMParser({onError:()=>{throw new Error('손상된 XML');}}).parseFromString(v,'application/xml');}
function pathFor(entries:Record<string,Uint8Array>,sheet:string){
 const wb=doc(strFromU8(entries['xl/workbook.xml'])),r=doc(strFromU8(entries['xl/_rels/workbook.xml.rels']));
 const id=Array.from(wb.getElementsByTagName('sheet')).find(s=>s.getAttribute('name')===sheet)?.getAttribute('r:id');
 const target=Array.from(r.getElementsByTagName('Relationship')).find(n=>n.getAttribute('Id')===id)?.getAttribute('Target');
 if(!target||/\.\.|\\/.test(target))throw new Error('시트를 확인해 주세요.');return target.startsWith('/')?target.slice(1):'xl/'+target;
}
const rowRE=(row:number)=>new RegExp(`<row\\b(?=[^>]*\\br="${row}")[^>]*(?:/>|>[\\s\\S]*?<\\/row>)`);
function clearCells(rowXml:string){return rowXml.replace(/<c\b(?=[^>]*\br="[A-L]\d+")[^>]*(?:\/>|>[\s\S]*?<\/c>)/g,'');}
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
 after[path]=strToU8(source.replace(rowRE(row),replacement));
 return {...out,bytes:zipSync(after),rowNumber:row};
}
/** HQ approves a blank template derived from an existing company month, not its records. */
export function addApprovedMonth(bytes:Uint8Array,sourceMonth:string,targetMonth:number){
 const wb=workbookFromFile(bytes),name=targetMonth+'월';if(targetMonth<1||targetMonth>12||!Number.isInteger(targetMonth))throw new Error('월을 확인해 주세요.');
 if(wb.Sheets[name])return bytes;
 const entries=unzipSync(bytes),sourcePath=pathFor(entries,sourceMonth);let sheet=strFromU8(entries[sourcePath]);
 // Drawings/comments contain old report data and are not portable template content.
 sheet=sheet.replace(/<(?:legacyDrawing|drawing|hyperlinks|extLst)\b[^>]*(?:\/>|>[\s\S]*?<\/(?:legacyDrawing|drawing|hyperlinks|extLst)>)/g,'');
 const parsed=doc(sheet);for(const node of Array.from(parsed.getElementsByTagName('*')))if(node.hasAttribute('r:id')&&node.tagName!=='pageSetup')throw new Error('이 양식의 외부 연결을 먼저 확인해 주세요.');for(const f of Array.from(parsed.getElementsByTagName('f')))if((f.textContent||'').includes('!')||['shared','array'].includes(f.getAttribute('t')||''))throw new Error('다른 시트를 참조하는 수식이 있습니다. 승인된 독립 양식을 준비해 주세요.');
 sheet=sheet.replace(/<c\b([^>]*\br="([A-Z]+)(\d+)"[^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g,(all,attrs,col,r,body='')=>{
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
