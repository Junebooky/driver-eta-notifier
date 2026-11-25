/** Normalize field LABELS only. Never strip whitespace or punctuation from values. */
const compactLabel = (value: string) => value.replace(/[\s\u200b\ufeff]/gu, '');

export function reportFieldValues(raw: string, label: string): string[] {
 const expected=compactLabel(label);
 const values:string[]=[];
 for(const line of raw.split(/\r?\n/u)){
  const colon=line.search(/[:：]/u);
  if(colon<0||compactLabel(line.slice(0,colon))!==expected)continue;
  values.push(line.slice(colon+1).trim());
 }
 return values;
}

/** A duplicate or empty field is ambiguous: never silently choose one value. */
export function readReportField(raw:string,label:string):string{
 const values=reportFieldValues(raw,label);
 return values.length===1?values[0]:'';
}
