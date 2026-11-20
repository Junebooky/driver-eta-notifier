/** Normalize existing owner Excel sheet labels WITHOUT renaming the worksheet. *
 * The original 2026 workbook uses "202610월" alongside "11월".
 * Keep exact workbook keys for edits/manifest; use "10월" only for the tab label.
 */
export type WorkbookMonthSheet={name:string;month:number;year:number|null};
export function parseWorkbookMonthSheet(name:string,ledgerYear?:number):WorkbookMonthSheet|null {
 const match=name.trim().match(/^(?:(20\d{2})(?:년)?\s*)?(1[0-2]|[1-9])월$/);
 if(!match)return null;
 const year=match[1]?Number(match[1]):null,month=Number(match[2]);
 if(year!==null&&ledgerYear!==undefined&&year!==ledgerYear)return null;
 return {name,month,year};
}
export function workbookMonthSheetNames(names:string[],year?:number):string[] {
 return names.filter(name=>parseWorkbookMonthSheet(name,year)!==null);
}
export function workbookMonthLabel(name:string):string {
 const parsed=parseWorkbookMonthSheet(name);
 return parsed?parsed.month+'월':name;
}
export function findWorkbookMonthSheetName(names:string[],month:number,year?:number):string|null {
 if(!Number.isInteger(month)||month<1||month>12)return null;
 const candidates=names.map(name=>parseWorkbookMonthSheet(name,year)).filter((v):v is WorkbookMonthSheet=>v!==null&&v.month===month);
 return candidates.find(v=>v.name===month+'월')?.name
  ??candidates.find(v=>year!==undefined&&v.year===year)?.name
  ??candidates[0]?.name??null;
}
