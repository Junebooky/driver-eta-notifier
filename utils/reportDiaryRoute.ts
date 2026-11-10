/**
 * One route parser for HQ Excel extraction, driver chat summaries and the
 * pre-submit validity gate. Only the contents of the "운행일지" section are parsed.
 *
 * Separators: arrows, >, standalone " - " and line breaks.
 * Hyphens attached to place names (e.g. 그랜드-인터컨티넨탈) are NOT separators.
 * "익일 03:30" and later unprefixed 04:15 after an explicit overnight marker
 * are interpreted as 27:30 and 28:15, without guessing midnight from a clock
 * moving backwards. Original report text is never rewritten.
 */
export interface DiaryWaypoint {
 place:string;
 time:string|null; // absolute clock, up to 47:59 (e.g. 27:30 means next day 03:30)
}
export interface ParsedDiaryRoute {
 present:boolean;
 stops:DiaryWaypoint[];
 timesOutOfOrder:boolean;
 invalidTimes:boolean;
}

// In a timestamped diary, a spaced dash inside a hotel/place name is not a
// separator unless another clock follows it. Untimed diaries may use " - ".
const ARROWS_AND_TIMED_DASH=/[ \t]*(?:→|➡|➔|⇒|➞|->|>|＞)[ \t]*|[ \t]*-[ \t]*(?=(?:(?:익일|다음날)[ \t]*)?\d{1,2}:\d{2})|\n+/u;
const ROUTE_SEPARATOR=/[ \t]*(?:→|➡|➔|⇒|➞|->|>|＞)[ \t]*|[ \t]+-[ \t]+|\n+/u;
const ROUTE_TIME=/^(?:(익일|다음날)[ \t]*)?(\d{1,2}):(\d{2})(?!\d)[ \t]*/u;
const STANDALONE_END=/^(?:업무[ \t]*종료|운행[ \t]*종료|종료)$/u;
const TRAILING_END=/[ \t]*\/[ \t]*(?:업무[ \t]*종료|운행[ \t]*종료|종료)[ \t]*$/u;

function clock(minutes:number){
 const hours=Math.floor(minutes/60);
 return String(hours).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
}
export function parseDiaryRoute(raw:string):ParsedDiaryRoute{
 const text=raw.replace(/\u00a0/g,' ').replace(/\r/g,'');
 const heading=/(?:^|\n|\\n)[ \t]*운행일지[ \t]*[:：]?[ \t]*\n/u.exec(text);
 if(!heading)return {present:false,stops:[],timesOutOfOrder:false,invalidTimes:false};
 const start=(heading.index||0)+heading[0].length;
 const body=text.slice(start).split(/\n[ \t]*(?:경비[ \t]*지출|특이[ \t]*사항|퇴근[ \t]*시간)(?:[ \t]*[:：]?[^\n]*)?(?:\n|$)/u)[0];
 const clocks=body.match(/\d{1,2}:\d{2}/g)||[];
 const chunks=body.split(clocks.length>=2?ARROWS_AND_TIMED_DASH:ROUTE_SEPARATOR);
 const stops:DiaryWaypoint[]=[];
 let nextDay=false,previous:number|null=null,timesOutOfOrder=false,invalidTimes=false;
 for(const chunk of chunks){
  let part=chunk.trim().replace(/^[-•·][ \t]*/u,'').trim();
  if(!part)continue;
  const m=part.match(ROUTE_TIME);
  let time:string|null=null;
  if(m){
   const hour=Number(m[2]),minute=Number(m[3]),nextDayLabel=Boolean(m[1]);
   if(hour>=48||minute>=60||(nextDayLabel&&hour>=24)){
    invalidTimes=true;
   }else{
    const absoluteHour=nextDayLabel?hour+24:hour>=24?hour:hour+(nextDay?24:0);
    const minutes=absoluteHour*60+minute;
    if(absoluteHour>=48)invalidTimes=true;
    else{
     time=clock(minutes);
     if(previous!==null&&minutes<previous)timesOutOfOrder=true;
     previous=minutes;
     if(nextDayLabel||hour>=24)nextDay=true;
    }
   }
   part=part.slice(m[0].length).trim();
  }else if(/^(?:익일|다음날)?[ \t]*\d{1,2}:\d{2}/u.test(part)){
   // Keep the place but never silently accept a malformed clock.
   invalidTimes=true;
   part=part.replace(/^(?:(?:익일|다음날)[ \t]*)?\d{1,2}:\d{2}[ \t]*/u,'').trim();
  }
  part=part.replace(TRAILING_END,'').trim();
  if(!part||STANDALONE_END.test(part))continue;
  stops.push({place:part,time});
 }
 return {present:true,stops,timesOutOfOrder,invalidTimes};
}

/** For explicit next-day service start/end fields; never guess that 02:00 is tomorrow. */
export function statedReportTime(value:string):string{
 const text=value.trim();
 const next=text.match(/^(?:익일|다음날)[ \t]*(\d{1,2}):(\d{2})$/u);
 if(next){
  const hour=Number(next[1]),minute=Number(next[2]);
  return hour<24&&minute<60?clock((hour+24)*60+minute):'';
 }
 const plain=text.match(/^(\d{1,2}):(\d{2})$/u);
 if(!plain)return '';
 const hour=Number(plain[1]),minute=Number(plain[2]);
 return hour<48&&minute<60?clock(hour*60+minute):'';
}
