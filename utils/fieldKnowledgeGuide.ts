import type { FieldKnowledgeItem } from '@/types/fieldKnowledge';

/** Predictable operational fields, never a single mixed paragraph. */
export interface FieldKnowledgeGuide {
  schemaVersion: 1;
  parking: {
    policy: 'unknown' | 'free' | 'paid' | 'conditional';
    graceMinutes: number | null;
    validation: 'unknown' | 'none' | 'hotel' | 'staff' | 'customer';
  };
  waiting: {
    level: string;
    zone: string;
    sprinter: 'unknown' | 'yes' | 'no' | 'confirm';
    heightLimitCm: number | null;
  };
  restroom: {
    level: string;
    landmark: string;
    access: 'unknown' | 'public' | 'staff' | 'restricted';
  };
  pickup: { level: string; gate: string; instruction: string };
  restrictions: Array<'no_roadside' | 'towing' | 'height_limit' | 'registration' | 'valet_only'>;
  notices: Array<{ type: 'construction' | 'event' | 'charging' | 'valet' | 'other'; detail: string }>;
}

export const FIELD_RESTRICTION_LABELS: Record<FieldKnowledgeGuide['restrictions'][number], string> = {
  no_roadside: '노상 정차 금지', towing: '견인·단속 주의',
  height_limit: '진입 높이 제한', registration: '차량 사전 등록 필요',
  valet_only: '발렛 이용 필수',
};
export const FIELD_NOTICE_LABELS: Record<FieldKnowledgeGuide['notices'][number]['type'], string> = {
  construction: '공사·통제', event: '행사·시간 변경',
  charging: '충전 시설', valet: '발렛 안내', other: '기타 안내',
};

export function emptyFieldKnowledgeGuide(): FieldKnowledgeGuide {
  return {
    schemaVersion: 1,
    parking: { policy: 'unknown', graceMinutes: null, validation: 'unknown' },
    waiting: { level: '', zone: '', sprinter: 'unknown', heightLimitCm: null },
    restroom: { level: '', landmark: '', access: 'unknown' },
    pickup: { level: '', gate: '', instruction: '' },
    restrictions: [], notices: [],
  };
}
const isObj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const oneOf=<T extends string>(v:unknown,allowed:readonly T[]):v is T=>
  typeof v==='string'&&allowed.includes(v as T);
const text=(v:unknown,max:number)=>typeof v==='string'&&v.trim().length<=max?v.trim():null;
const num=(v:unknown,max:number)=>v===null||(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max);
type GuideResult={ok:true;guide:FieldKnowledgeGuide}|{ok:false;error:string};

export function validateFieldKnowledgeGuide(input:unknown):GuideResult {
  if(!isObj(input)||input.schemaVersion!==1)return {ok:false,error:'현장정보 양식 버전을 확인해 주세요.'};
  const {parking,waiting,restroom,pickup,restrictions,notices}=input;
  if(!isObj(parking)||!isObj(waiting)||!isObj(restroom)||!isObj(pickup))
    return {ok:false,error:'주차·대기·화장실·승하차 항목은 지정된 양식으로 입력해 주세요.'};
  if(!oneOf(parking.policy,['unknown','free','paid','conditional'])||
    !oneOf(parking.validation,['unknown','none','hotel','staff','customer'])||
    !num(parking.graceMinutes,1440))
    return {ok:false,error:'무료회차 정책·등록 방식·시간(0~1440분)을 확인해 주세요.'};
  if(parking.graceMinutes!==null&&parking.policy!=='free'&&parking.policy!=='conditional')
    return {ok:false,error:'회차 시간을 입력했다면 무료 또는 조건부 정책을 선택해 주세요.'};
  if(!oneOf(waiting.sprinter,['unknown','yes','no','confirm'])||
    !num(waiting.heightLimitCm,600))
    return {ok:false,error:'스프린터 진입 가능 여부와 높이 제한을 확인해 주세요.'};
  if(!oneOf(restroom.access,['unknown','public','staff','restricted']))
    return {ok:false,error:'화장실 이용 구분을 선택해 주세요.'};
  const fields=[
    ['대기 층',waiting.level,40],['대기 구역',waiting.zone,100],
    ['화장실 층',restroom.level,40],['화장실 위치',restroom.landmark,120],
    ['승하차 층',pickup.level,40],['승하차 게이트',pickup.gate,100],
    ['승하차 진입 안내',pickup.instruction,180],
  ] as const;
  for(const [label,value,max] of fields){
    if(text(value,max)===null)return {ok:false,error:label+'은 '+max+'자 이내로 입력해 주세요.'};
  }
  if(waiting.zone&&!waiting.level)
    return {ok:false,error:'차량 대기 구역을 입력했다면 대기 층도 입력해 주세요.'};
  if(restroom.landmark&&!restroom.level)
    return {ok:false,error:'화장실 위치를 입력했다면 층도 입력해 주세요.'};
  if(pickup.gate&&!pickup.level)
    return {ok:false,error:'승하차 게이트를 입력했다면 층도 입력해 주세요.'};
  const keys=Object.keys(FIELD_RESTRICTION_LABELS) as FieldKnowledgeGuide['restrictions'];
  if(!Array.isArray(restrictions)||restrictions.length>keys.length||
    restrictions.some(v=>!oneOf(v,keys))||new Set(restrictions).size!==restrictions.length)
    return {ok:false,error:'주정차 주의사항은 제공된 선택 항목만 사용할 수 있어요.'};
  const kinds=Object.keys(FIELD_NOTICE_LABELS) as Array<FieldKnowledgeGuide['notices'][number]['type']>;
  if(!Array.isArray(notices)||notices.length>8||notices.some(v=>!isObj(v)||
    !oneOf(v.type,kinds)||text(v.detail,240)===null||!String(v.detail).trim()))
    return {ok:false,error:'추가 안내는 유형별 최대 8개, 각각 1~240자로 입력해 주세요.'};
  return {ok:true,guide:{
    schemaVersion:1,
    parking:{policy:parking.policy,graceMinutes:parking.graceMinutes as number|null,validation:parking.validation},
    waiting:{level:(waiting.level as string).trim(),zone:(waiting.zone as string).trim(),
      sprinter:waiting.sprinter,heightLimitCm:waiting.heightLimitCm as number|null},
    restroom:{level:(restroom.level as string).trim(),landmark:(restroom.landmark as string).trim(),access:restroom.access},
    pickup:{level:(pickup.level as string).trim(),gate:(pickup.gate as string).trim(),
      instruction:(pickup.instruction as string).trim()},
    restrictions:restrictions as FieldKnowledgeGuide['restrictions'],
    notices:(notices as FieldKnowledgeGuide['notices']).map(v=>({type:v.type,detail:v.detail.trim()})),
  }};
}

export function legacyFieldKnowledgeEntries(item:FieldKnowledgeItem){
  const fields=[
    ['freeParkingNotice','무료회차 안내'],['sprinterWaiting','스프린터 대기'],
    ['restroomLocation','화장실 위치'],['pickupLocationNotes','승하차 위치'],
    ['vehicleWaitingNotes','차량 대기'],['cautionNotes','주정차 주의'],
    ['additionalNotes','추가 정보'],
  ] as const;
  return fields.flatMap(([field,label])=>{
    const value=item[field];
    return typeof value==='string'&&value.trim()?[{field,label,value:value.trim()}]:[];
  });
}
