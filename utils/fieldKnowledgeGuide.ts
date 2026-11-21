import type { FieldKnowledgeItem } from '@/types/fieldKnowledge';

/** Single restroom location entry (a venue can have several across floors). */
export interface FieldKnowledgeRestroomLocation {
  level: string;
  landmark: string;
  access: 'unknown' | 'public' | 'staff' | 'restricted';
}

export type FieldKnowledgeParkingValidation =
  | 'unknown'
  | 'none'
  | 'hotel'
  | 'concierge'
  | 'event'
  | 'staff'
  | 'customer';

/** Predictable operational fields, never a single mixed paragraph. */
export interface FieldKnowledgeGuide {
  schemaVersion: 1;
  parking: {
    policy: 'unknown' | 'free' | 'paid' | 'conditional';
    graceMinutes: number | null;
    validation: FieldKnowledgeParkingValidation;
    conditionDetail?: string;
    tips?: string;
  };
  waiting: {
    level: string;
    zone: string;
    sprinter: 'unknown' | 'yes' | 'no' | 'confirm';
    heightLimitCm: number | null;
  };
  /** Primary restroom location (kept synced with restrooms[0] for backward compatibility). */
  restroom: FieldKnowledgeRestroomLocation;
  /** Multiple restroom locations across floors/zones (e.g. L/LL lobby & basement parking). */
  restrooms?: FieldKnowledgeRestroomLocation[];
  pickup: { level: string; gate: string; instruction: string };
  restrictions: Array<'no_roadside' | 'towing' | 'height_limit' | 'registration' | 'valet_only'>;
  notices: Array<{ type: 'construction' | 'event' | 'charging' | 'valet' | 'other'; detail: string }>;
}

export const FIELD_FLOOR_PRESET_OPTIONS = [
  { value: '', label: '미등록' },
  { value: 'L', label: 'L (로비 · 1층)' },
  { value: 'LL', label: 'LL (로워 로비 · B1급)' },
  { value: 'G', label: 'G (그라운드)' },
  { value: 'M', label: 'M (중층 · 메자닌)' },
  { value: 'B5', label: 'B5' },
  { value: 'B4', label: 'B4' },
  { value: 'B3', label: 'B3' },
  { value: 'B2', label: 'B2' },
  { value: 'B1', label: 'B1' },
  { value: '1F', label: '1F' },
  { value: '2F', label: '2F' },
  { value: '3F', label: '3F' },
  { value: '4F', label: '4F' },
  { value: '5F', label: '5F' },
  { value: '로비', label: '로비' },
  { value: '옥외', label: '옥외' },
  { value: '기타', label: '기타 (직접 입력)' },
] as const;

export const FIELD_PARKING_VALIDATION_LABELS: Record<FieldKnowledgeParkingValidation, string> = {
  unknown: '미확인',
  none: '별도 등록 불필요',
  hotel: '호텔 프런트·체크인 확인',
  concierge: '컨시어지·도어 데스크 확인',
  event: '행사명·주최 측 전달',
  staff: '현장 직원 확인',
  customer: '고객·담당자 등록',
};

export const FIELD_RESTRICTION_LABELS: Record<FieldKnowledgeGuide['restrictions'][number], string> = {
  no_roadside: '노상 정차 금지', towing: '견인·단속 주의',
  height_limit: '진입 높이 제한', registration: '차량 사전 등록 필요',
  valet_only: '발렛 이용 필수',
};
export const FIELD_NOTICE_LABELS: Record<FieldKnowledgeGuide['notices'][number]['type'], string> = {
  construction: '공사·통제', event: '행사·시간 변경',
  charging: '충전 시설', valet: '발렛 안내', other: '기타 안내',
};

export function emptyRestroomLocation(): FieldKnowledgeRestroomLocation {
  return { level: '', landmark: '', access: 'unknown' };
}

export function getFieldKnowledgeRestrooms(guide?: FieldKnowledgeGuide | null): FieldKnowledgeRestroomLocation[] {
  if (!guide) return [];
  if (Array.isArray(guide.restrooms) && guide.restrooms.length > 0) {
    return guide.restrooms;
  }
  const r = guide.restroom;
  if (r && (r.level.trim() || r.landmark.trim() || r.access !== 'unknown')) {
    return [r];
  }
  return [];
}

export function emptyFieldKnowledgeGuide(): FieldKnowledgeGuide {
  return {
    schemaVersion: 1,
    parking: { policy: 'unknown', graceMinutes: null, validation: 'unknown', conditionDetail: '', tips: '' },
    waiting: { level: '', zone: '', sprinter: 'unknown', heightLimitCm: null },
    restroom: emptyRestroomLocation(),
    restrooms: [],
    pickup: { level: '', gate: '', instruction: '' },
    restrictions: [], notices: [],
  };
}
const isObj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const oneOf=<T extends string>(v:unknown,allowed:readonly T[]):v is T=>
  typeof v==='string'&&allowed.includes(v as T);
const text=(v:unknown,max:number)=>typeof v==='string'&&v.trim().length<=max?v.trim():null;
const optionalText=(v:unknown,max:number)=>v===undefined||v===null?'':text(v,max);
const num=(v:unknown,max:number)=>v===null||(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max);
type GuideResult={ok:true;guide:FieldKnowledgeGuide}|{ok:false;error:string};

export function validateFieldKnowledgeGuide(input:unknown):GuideResult {
  if(!isObj(input)||input.schemaVersion!==1)return {ok:false,error:'현장정보 양식 버전을 확인해 주세요.'};
  const {parking,waiting,restroom,restrooms,pickup,restrictions,notices}=input;
  if(!isObj(parking)||!isObj(waiting)||!isObj(restroom)||!isObj(pickup))
    return {ok:false,error:'주차·대기·화장실·승하차 항목은 지정된 양식으로 입력해 주세요.'};
  const allowedValidations = Object.keys(FIELD_PARKING_VALIDATION_LABELS) as FieldKnowledgeParkingValidation[];
  if(!oneOf(parking.policy,['unknown','free','paid','conditional'])||
    !oneOf(parking.validation,allowedValidations)||
    !num(parking.graceMinutes,1440))
    return {ok:false,error:'무료회차 정책·등록 방식·시간(0~1440분)을 확인해 주세요.'};
  if(parking.graceMinutes!==null&&parking.policy!=='free'&&parking.policy!=='conditional')
    return {ok:false,error:'회차 시간을 입력했다면 무료 또는 조건부 정책을 선택해 주세요.'};
  const conditionDetail = optionalText(parking.conditionDetail, 240);
  const parkingTips = optionalText(parking.tips, 300);
  if(conditionDetail===null)return {ok:false,error:'주차 등록 조건·전달 방법은 240자 이내로 입력해 주세요.'};
  if(parkingTips===null)return {ok:false,error:'주차 팁·현장 요령은 300자 이내로 입력해 주세요.'};
  if(!oneOf(waiting.sprinter,['unknown','yes','no','confirm'])||
    !num(waiting.heightLimitCm,600))
    return {ok:false,error:'스프린터 진입 가능 여부와 높이 제한을 확인해 주세요.'};
  const validateSingleRestroom = (entry: Record<string, unknown>): { ok: true; value: FieldKnowledgeRestroomLocation } | { ok: false; error: string } => {
    if(!oneOf(entry.access,['unknown','public','staff','restricted']))
      return {ok:false,error:'화장실 이용 구분을 선택해 주세요.'};
    const level = text(entry.level, 40);
    const landmark = text(entry.landmark, 120);
    if(level===null)return {ok:false,error:'화장실 층은 40자 이내로 입력해 주세요.'};
    if(landmark===null)return {ok:false,error:'화장실 위치는 120자 이내로 입력해 주세요.'};
    if(landmark&&!level)
      return {ok:false,error:'화장실 위치를 입력했다면 층도 입력해 주세요.'};
    return {ok:true,value:{level,landmark,access:entry.access}};
  };

  let normalizedRestroom: FieldKnowledgeRestroomLocation;
  let normalizedRestrooms: FieldKnowledgeRestroomLocation[] | undefined;

  if(restrooms !== undefined) {
    if(!Array.isArray(restrooms) || restrooms.length > 6 || restrooms.some(entry => !isObj(entry)))
      return {ok:false,error:'화장실 위치는 최대 6개까지 지정된 양식으로 입력해 주세요.'};
    const parsed: FieldKnowledgeRestroomLocation[] = [];
    for(const entry of restrooms) {
      const res = validateSingleRestroom(entry);
      if(!res.ok) return res;
      if(res.value.level || res.value.landmark || res.value.access !== 'unknown') {
        parsed.push(res.value);
      }
    }
    if(parsed.length === 0) {
      const fallbackSingle = validateSingleRestroom(restroom);
      if(!fallbackSingle.ok) return fallbackSingle;
      normalizedRestroom = fallbackSingle.value;
      normalizedRestrooms = fallbackSingle.value.level || fallbackSingle.value.landmark || fallbackSingle.value.access !== 'unknown'
        ? [fallbackSingle.value]
        : [];
    } else {
      normalizedRestroom = parsed[0];
      normalizedRestrooms = parsed;
    }
  } else {
    const single = validateSingleRestroom(restroom);
    if(!single.ok) return single;
    normalizedRestroom = single.value;
  }

  const fields=[
    ['대기 층',waiting.level,40],['대기 구역',waiting.zone,100],
    ['승하차 층',pickup.level,40],['승하차 게이트',pickup.gate,100],
    ['승하차 진입 안내',pickup.instruction,180],
  ] as const;
  for(const [label,value,max] of fields){
    if(text(value,max)===null)return {ok:false,error:label+'은 '+max+'자 이내로 입력해 주세요.'};
  }
  if(waiting.zone&&!waiting.level)
    return {ok:false,error:'차량 대기 구역을 입력했다면 대기 층도 입력해 주세요.'};
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
    parking:{
      policy:parking.policy,
      graceMinutes:parking.graceMinutes as number|null,
      validation:parking.validation,
      ...(conditionDetail ? { conditionDetail } : {}),
      ...(parkingTips ? { tips: parkingTips } : {}),
    },
    waiting:{level:(waiting.level as string).trim(),zone:(waiting.zone as string).trim(),
      sprinter:waiting.sprinter,heightLimitCm:waiting.heightLimitCm as number|null},
    restroom:normalizedRestroom,
    ...(normalizedRestrooms !== undefined ? { restrooms: normalizedRestrooms } : {}),
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
