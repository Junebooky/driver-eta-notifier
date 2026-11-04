import {DOMParser} from '@xmldom/xmldom';
type XmlElement = NonNullable<ReturnType<DOMParser['parseFromString']>['documentElement']>;
import {strFromU8,strToU8} from 'fflate';

/**
 * Formatting changes apply only to newly appended A-L cells and the three
 * requested column widths. Existing rows, formulas and template style IDs stay untouched.
 */
const COLUMN_WIDTHS: Record<number,number>={7:62,8:22,9:29};

const parse=(xml:string)=>{
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('지원하지 않는 Excel 스타일 XML입니다.');
 return new DOMParser({onError:()=>{throw new Error('Excel 스타일 XML을 읽지 못했습니다.');}}).parseFromString(xml,'application/xml');
};
function attribute(tag:string,name:string,value:string){
 const re=new RegExp('\\b'+name+'="[^"]*"');
 if(re.test(tag))return tag.replace(re,name+'="'+value+'"');
 return tag.replace(/\/>$/, ' '+name+'="'+value+'"/>');
}
function fontSize(font:XmlElement|undefined){
 const size=font?.getElementsByTagName('sz')[0]?.getAttribute('val');
 return size==null?null:Number(size);
}
function ensureFonts(xml:string){
 if(/<fonts\b[^>]*>/.test(xml))return xml;
 if(/<fonts\b[^>]*\/>/.test(xml))return xml.replace(/<fonts\b[^>]*\/>/,'<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>');
 const idx=xml.search(/<(?:fills|borders|cellStyleXfs|cellXfs)\b/);
 if(idx<0)throw new Error('Excel 스타일 기본 구조가 없습니다.');
 return xml.slice(0,idx)+'<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'+xml.slice(idx);
}
function setCount(xml:string,name:string,value:number){
 const re=new RegExp('<'+name+'\\b[^>]*>');
 return xml.replace(re,open=>/\bcount="[^"]*"/.test(open)?open.replace(/\bcount="[^"]*"/,'count="'+value+'"'):open.replace(/>$/,' count="'+value+'">'));
}
export function reportRowCellStyles(entries:Record<string,Uint8Array>,templateStyles:Map<string,string|null>){
 const bytes=entries['xl/styles.xml'];
 if(!bytes)throw new Error('Excel 원본의 스타일 시트를 확인해 주세요.');
 let stylesXml=ensureFonts(strFromU8(bytes));
 const parsed=parse(stylesXml),fontsElement=parsed.getElementsByTagName('fonts')[0],xfsElement=parsed.getElementsByTagName('cellXfs')[0];
 if(!fontsElement||!xfsElement)throw new Error('Excel 셀 서식이 없는 장부입니다.');
 const fonts=Array.from(fontsElement.getElementsByTagName('font'));
 const xfs=Array.from(xfsElement.getElementsByTagName('xf'));
 if(!xfs.length)throw new Error('Excel 셀 서식을 확인해 주세요.');
 const addedFonts:string[]=[],addedXfs:string[]=[];
 const fontCache=new Map<string,number>(),styleCache=new Map<string,number>();
 const styleIds:number[]=[];
 for(let column=0;column<12;column++){
  const letter=String.fromCharCode(65+column);
  const wanted=column>=6&&column<=8?10:11;
  const wrap=column>=6&&column<=8;
  const index=Number(templateStyles.get(letter)??0);
  if(!Number.isInteger(index)||index<0||index>=xfs.length)throw new Error('기준 행의 Excel 셀 서식을 확인해 주세요.');
  const oldXf=xfs[index];
  const originalFontId=Number(oldXf.getAttribute('fontId')||0);
  const oldFont=fonts[originalFontId]||fonts[0];
  const oldAlignment=oldXf.getElementsByTagName('alignment')[0];
  const alreadyWrapped=oldAlignment?.getAttribute('wrapText')==='1';
  if(fontSize(oldFont)===wanted&&(!wrap||alreadyWrapped)){
   styleIds.push(index);continue;
  }
  const styleKey=index+'|'+wanted+'|'+(wrap?'wrap':'normal');
  const found=styleCache.get(styleKey);
  if(found!==undefined){styleIds.push(found);continue;}
  let newFontId=originalFontId;
  if(fontSize(oldFont)!==wanted){
   const fontKey=originalFontId+'|'+wanted;
   const cached=fontCache.get(fontKey);
   if(cached!==undefined)newFontId=cached;
   else{
    const clone=(oldFont?oldFont.cloneNode(true):parsed.createElement('font')) as XmlElement;
    let size=clone.getElementsByTagName('sz')[0];
    if(!size){
     size=parsed.createElementNS(clone.namespaceURI,'sz');
     clone.insertBefore(size,clone.firstChild);
    }
    size.setAttribute('val',String(wanted));
    const markup=clone.toString();
    const existing=fonts.findIndex(node=>node.toString()===markup);
    const pending=addedFonts.indexOf(markup);
    newFontId=existing>=0?existing:pending>=0?fonts.length+pending:fonts.length+addedFonts.length;
    if(existing<0&&pending<0)addedFonts.push(markup);
    fontCache.set(fontKey,newFontId);
   }
  }
  const xf=oldXf.cloneNode(true) as XmlElement;
  xf.setAttribute('fontId',String(newFontId));
  xf.setAttribute('applyFont','1');
  if(wrap){
   let alignment=xf.getElementsByTagName('alignment')[0];
   if(!alignment){
    alignment=parsed.createElementNS(xf.namespaceURI,'alignment');
    xf.appendChild(alignment);
   }
   alignment.setAttribute('wrapText','1');
   xf.setAttribute('applyAlignment','1');
  }
  const markup=xf.toString();
  const existing=xfs.findIndex(node=>node.toString()===markup);
  const pending=addedXfs.indexOf(markup);
  const styleId=existing>=0?existing:pending>=0?xfs.length+pending:xfs.length+addedXfs.length;
  if(existing<0&&pending<0)addedXfs.push(markup);
  styleCache.set(styleKey,styleId);
  styleIds.push(styleId);
 }
 if(addedFonts.length){
  stylesXml=stylesXml.replace(/<\/fonts\s*>/,addedFonts.join('')+'</fonts>');
  stylesXml=setCount(stylesXml,'fonts',fonts.length+addedFonts.length);
 }
 if(addedXfs.length){
  stylesXml=stylesXml.replace(/<\/cellXfs\s*>/,addedXfs.join('')+'</cellXfs>');
  stylesXml=setCount(stylesXml,'cellXfs',xfs.length+addedXfs.length);
 }
 if(addedFonts.length||addedXfs.length){
  parse(stylesXml); // Validate before overwriting the ZIP entry.
  entries['xl/styles.xml']=strToU8(stylesXml);
 }
 return styleIds;
}
function setColAttr(tag:string,name:string,value:string){
 const re=new RegExp('\\b'+name+'="[^"]*"');
 if(re.test(tag))return tag.replace(re,name+'="'+value+'"');
 return tag.replace(/\/>$/, ' '+name+'="'+value+'"/>');
}
function colSegment(tag:string,min:number,max:number,width?:number){
 let next=setColAttr(setColAttr(tag,'min',String(min)),'max',String(max));
 if(width!==undefined){
  const existing=Number(tag.match(/\bwidth="([^"]+)"/)?.[1]||0);
  next=setColAttr(next,'width',String(Math.max(width,Number.isFinite(existing)?existing:0)));
  next=setColAttr(next,'customWidth','1');
 }
 return next;
}
/** Increase widths only; never shrink wider custom widths or unrelated columns. */
export function widenReportColumns(source:string){
 const match=source.match(/<cols\b[^>]*>[\s\S]*?<\/cols>/);
 const specs=match?Array.from(match[0].matchAll(/<col\b[^>]*\/>/g)).map(x=>x[0]):[];
 if(match){
  const content=match[0].replace(/^<cols\b[^>]*>/,'').replace(/<\/cols>$/,'').replace(/<col\b[^>]*\/>/g,'').trim();
  if(content)throw new Error('특수 열 서식이 있어 자동 너비 조정을 중단했습니다.');
 }
 const pieces:{min:number;max:number;xml:string}[]=[];
 const covered=new Set<number>();
 for(const spec of specs){
  const min=Number(spec.match(/\bmin="(\d+)"/)?.[1]);
  const max=Number(spec.match(/\bmax="(\d+)"/)?.[1]);
  if(!Number.isInteger(min)||!Number.isInteger(max)||min>max||min<1)throw new Error('Excel 열 너비 정보를 확인해 주세요.');
  const cuts=[min,max+1];
  for(const target of [7,8,9])if(min<=target&&target<=max){cuts.push(target,target+1);covered.add(target);}
  const bounds=[...new Set(cuts)].sort((a,b)=>a-b);
  for(let i=0;i<bounds.length-1;i++){
   const start=bounds[i],end=bounds[i+1]-1;
   pieces.push({min:start,max:end,xml:start===min&&end===max&&COLUMN_WIDTHS[start]===undefined?spec:colSegment(spec,start,end,start===end?COLUMN_WIDTHS[start]:undefined)});
  }
 }
 for(const target of [7,8,9])if(!covered.has(target)){
  pieces.push({min:target,max:target,xml:'<col min="'+target+'" max="'+target+'" width="'+COLUMN_WIDTHS[target]+'" customWidth="1"/>'});
 }
 pieces.sort((a,b)=>a.min-b.min||a.max-b.max);
 const cols='<cols>'+pieces.map(p=>p.xml).join('')+'</cols>';
 if(match)return source.replace(match[0],cols);
 if(/<cols\b[^>]*\/>/.test(source))return source.replace(/<cols\b[^>]*\/>/,cols);
 return source.replace(/<sheetData\b/,cols+'<sheetData');
}
/** Approximate rows needed for long wrapped route text, capped to avoid huge rows. */
export function reportRowHeight(route:string,service:string,overtime:string){
 const width=(v:string)=>Array.from(v).reduce((sum,ch)=>sum+(ch.charCodeAt(0)>255?1.9:1),0);
 const lines=Math.max(1,Math.ceil(width(route)/58),Math.ceil(width(service)/20),Math.ceil(width(overtime)/27));
 return Math.min(82,Math.max(24,lines*15+5));
}
