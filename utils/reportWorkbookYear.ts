import {workbookFromFile} from './kakaoExcelWorkbook';
/** The registered annual file name is authoritative; otherwise require one unambiguous data year. */
export function reportWorkbookYear(bytes:Uint8Array,filename:string):number|null {
 const named=[...filename.matchAll(/(?:^|\D)(20\d{2})(?=\D|$)/g)].map(m=>Number(m[1]));
 const explicit=[...new Set(named)];if(explicit.length>1)return null;
 const wb=workbookFromFile(bytes),years=new Set<number>();
 for(const name of wb.SheetNames.filter(n=>/^\d{1,2}월$/.test(n))){
  for(const [address,cell] of Object.entries(wb.Sheets[name].cells)){
   if(!/^A(?:[2-9]|\d{2,})$/.test(address))continue;
   if(typeof cell.v==='number'&&Number.isFinite(cell.v)){
    const epoch=Date.UTC(wb.date1904?1904:1899,wb.date1904?0:11,wb.date1904?1:30);
    const year=new Date(epoch+cell.v*86400000).getUTCFullYear();if(year>=2000&&year<=2099)years.add(year);
   }else if(typeof cell.v==='string'){
    const match=cell.v.match(/^(20\d{2})[-/.년]/);if(match)years.add(Number(match[1]));
   }
  }
 }
 if(years.size>1)return null;
 const dataYear=years.size===1?[...years][0]:null;
 if(explicit.length===1)return dataYear===null||dataYear===explicit[0]?explicit[0]:null;
 return dataYear;
}
