import { FieldKnowledgeItem, FieldKnowledgeCategory } from '@/types/fieldKnowledge';

export const FIELD_KNOWLEDGE_STORAGE_KEY = 'vip_field_knowledge_items_v1';
export const FIELD_KNOWLEDGE_CHANGE_EVENT = 'vip_field_knowledge_updated';

export const INITIAL_FIELD_KNOWLEDGE_ITEMS: FieldKnowledgeItem[] = [
  {
    id: 'fk-01',
    title: '인천공항 T2',
    subtitle: '미팅포인트 안내',
    category: '공항',
    categoryBadge: '공항',
    description: '대한항공 및 스카이팀 전용 터미널, 의전 피켓 포인트 및 3층 단기 정차 구역',
    imageUrl: 'https://images.unsplash.com/photo-1542296332-2e4473faf563?auto=format&fit=crop&w=800&q=80',
    photos: [
      'https://images.unsplash.com/photo-1542296332-2e4473faf563?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1530521954074-e64f6810b32d?auto=format&fit=crop&w=800&q=80',
    ],
    address: '인천 중구 제2터미널대로 446',
    phone: '1577-2600',
    website: 'https://www.airport.kr',
    freeParkingNotice: '기본 10분 무료회차 (단기주차장 진입 시 20분 내 출차 무료)',
    sprinterWaiting: '동편 단기주차장 지상 1층 대형버스/하이리무진 전용 슬롯',
    restroomLocation: '3층 출국장 B-C 체크인 카운터 부근 및 1층 입국장 중앙',
    pickupLocationNotes: '1층 입국장 B 게이트 앞 3번 횡단보도 정차 구역 (승객 탑승 확인 후 3분 내 출발)',
    vehicleWaitingNotes: '화물터미널 인근 장기 대기 주차장 또는 단기주차장 외곽 슬롯 활용',
    cautionNotes: '3층 출국장 도로 5분 이상 정차 시 자동 CCTV 과태료 부과 (즉시 이동 필수)',
    additionalNotes: 'VIP 피켓 서비스는 1층 입국장 B게이트 내부 안내데스크 우측 지정 구역에서 진행.',
    updatedAt: '2026-10-29T10:00:00Z',
    updatedBy: '본사 운영팀',
  },
  {
    id: 'fk-02',
    title: '조선팰리스 강남',
    subtitle: '차량 진입 안내',
    category: '호텔',
    categoryBadge: '호텔',
    description: '품격과 여유가 흐르는 도심 속 럭셔리 호텔, 테헤란로 센터필드 West동',
    imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
    photos: [
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80',
    ],
    address: '서울 강남구 테헤란로 231 센터필드타워 West동',
    phone: '02-727-7200',
    website: 'https://www.josunhotel.com',
    freeParkingNotice: '30분 (호텔 등록 시 무료, 이후 유료)',
    sprinterWaiting: '로비 앞, B2, B3 (상황에 따라 변동 가능, 컨시어지 확인 필요)',
    restroomLocation: '로비층, B2층 (직원 전용 화장실 별도)',
    pickupLocationNotes: '로비 정문 앞 드롭오프 존 (비상등 점등 후 VIP 하차 즉시 회차)',
    vehicleWaitingNotes: '지하 주차장 대기 구역 (직원 안내 필요, 차고 2.7m 이상 스프린터 주의)',
    cautionNotes: '테헤란로 출입구 일방통행 진입 주의. 퇴근 시간 테헤란로 유턴 정체 극심.',
    additionalNotes: '해외 VIP 영접 시 컨시어지 데스크에 차량번호 사전 전달 시 드롭오프 대기 시간 단축.',
    updatedAt: '2026-10-29T10:15:00Z',
    updatedBy: '본사 관리자',
  },
  {
    id: 'fk-03',
    title: '신라호텔 서울',
    subtitle: '주차 및 발렛',
    category: '호텔',
    categoryBadge: '호텔',
    description: '남산 자락의 프리미엄 호텔, 영빈관 및 본관 로비 드롭오프 동선',
    imageUrl: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80',
    photos: [
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80',
    ],
    address: '서울 중구 동호로 249',
    phone: '02-2233-3131',
    website: 'https://www.shillahotels.com',
    freeParkingNotice: '30분 무료회차 (호텔 프론트/식음업장 주차등록 시 3시간 무료)',
    sprinterWaiting: '면세점 방향 야외 대형버스 대기 라인 (스프린터 519 진입 가능)',
    restroomLocation: '본관 1층 로비 패스트리 부티크 뒤편 및 영빈관 지하 1층',
    pickupLocationNotes: '본관 회전문 앞 로비 드롭오프 존 (호텔 도어맨 배차 조율)',
    vehicleWaitingNotes: '지상 주차타워 1층 외곽 또는 팔각정 인근 대기 라인',
    cautionNotes: '남산 진입 오르막길 서행 운행. 겨울철 결빙 시 서행 주의.',
    additionalNotes: '영빈관 단독 행사 시 정문에서 영빈관 전용 게이트로 직접 진입 가능.',
    updatedAt: '2026-10-29T09:30:00Z',
    updatedBy: '본사 운영팀',
  },
  {
    id: 'fk-04',
    title: '롯데월드타워',
    subtitle: '주차 정보',
    category: '기타',
    categoryBadge: '주차/빌딩',
    description: '시그니엘 서울 및 포디움 행사장, 555m 랜드마크 의전 동선',
    imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80',
    photos: [
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80',
    ],
    address: '서울 송파구 올림픽로 300',
    phone: '02-3213-5000',
    website: 'https://www.lwt.co.kr',
    freeParkingNotice: '최초 30분 무료 회차, 이후 10분당 500원 (시그니엘 투숙객 무료)',
    sprinterWaiting: '지하 2층 시그니엘 호텔 전용 발렛 존 (층고 3.2m 통과 가능 구역)',
    restroomLocation: '지하 1층 타워 로비 및 79층 시그니엘 라운지',
    pickupLocationNotes: '지상 1층 동편 시그니엘 단독 회전문 앞 또는 B2 시그니엘 로비',
    vehicleWaitingNotes: 'B3 H구역 또는 외곽 대형 차량 전용 슬롯',
    cautionNotes: '잠실역 사거리 버스전용차로 끼어들기 단속 주의, 주말 올림픽로 극심한 혼잡.',
    additionalNotes: '시그니엘 투숙 VIP는 지하 2층 전용 로비에서 체크인 지원 권장.',
    updatedAt: '2026-10-29T09:00:00Z',
    updatedBy: '본사 운영팀',
  },
  {
    id: 'fk-05',
    title: 'COEX 행사장',
    subtitle: '하차동선 위치',
    category: '기타',
    categoryBadge: '행사장',
    description: '국제 컨벤션 및 전시회, 인터컨티넨탈 호텔 연계 VIP 동선',
    imageUrl: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=800&q=80',
    photos: [
      'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=800&q=80',
    ],
    address: '서울 강남구 영동대로 513',
    phone: '02-6000-0114',
    website: 'https://www.coex.co.kr',
    freeParkingNotice: '20분 무료회차 (화물 및 하역은 사전 등록증 필요)',
    sprinterWaiting: '동문 야외 지상 대형차량 대기장소 (영동대로변)',
    restroomLocation: '1층 동문 로비 및 그랜드볼룸 안내데스크 좌측',
    pickupLocationNotes: '동문 정문 드롭오프 베이 또는 아셈타워 앞 택시정차대 인근',
    vehicleWaitingNotes: '탄천 공영주차장 활용 권장 (대형 행사 시 코엑스 내부 주차 불가)',
    cautionNotes: '영동대로 복합환승센터 공사 구간으로 진입 차선 사전 숙지 필수.',
    additionalNotes: '국제회의 의전 시 VIP 전용 출입구(남문 또는 아셈볼룸) 사전 확인.',
    updatedAt: '2026-10-29T08:30:00Z',
    updatedBy: '본사 관리자',
  },
  {
    id: 'fk-06',
    title: '현대백화점 압구정',
    subtitle: '발렛 안내',
    category: '쇼핑',
    categoryBadge: '쇼핑',
    description: '압구정 본점 쟈스민 VIP 라운지 및 후문 발렛 라인',
    imageUrl: 'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?auto=format&fit=crop&w=800&q=80',
    photos: [
      'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?auto=format&fit=crop&w=800&q=80',
    ],
    address: '서울 강남구 압구정로 165',
    phone: '02-547-2233',
    website: 'https://www.ehyundai.com',
    freeParkingNotice: '30분 무료 (구매 영수증 또는 백화점 카드 인증 시 추가)',
    sprinterWaiting: '백화점 별관 주차장 또는 압구정역 6번 출구 공영주차장',
    restroomLocation: '별관 2층 쟈스민 라운지 앞 및 본관 지하 1층',
    pickupLocationNotes: '후문 VIP 발렛 파킹 존 (주차요원 안내에 따라 1차선 일시 대기)',
    vehicleWaitingNotes: '압구정 고가 밑 공영주차장 또는 한강공원 잠원지구',
    cautionNotes: '후문 진입로 골목 보행자 밀집, 주말 진입 대기열 30분 이상 소요.',
    additionalNotes: '쟈스민 블랙/블루 고객의 경우 후문 발렛 데스크와 무전 연결 가능.',
    updatedAt: '2026-10-28T17:00:00Z',
    updatedBy: '본사 운영팀',
  },
  {
    id: 'fk-07',
    title: '서울 버스전용차로',
    subtitle: '운행 규정',
    category: '교통',
    categoryBadge: '교통',
    description: '경부고속도로 및 도심 가로변/중앙 버스전용차로 9인승 이상 규정',
    imageUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80',
    photos: [
      'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80',
    ],
    address: '경부고속도로 한남대교 남단 ~ 신탄진 IC 구간',
    phone: '1588-2504',
    website: 'https://www.ex.co.kr',
    freeParkingNotice: '해당 없음 (고속도로)',
    sprinterWaiting: '휴게소 전용 대형 주차면 (만남의 광장 등)',
    restroomLocation: '서울만남의광장 휴게소 하행선',
    pickupLocationNotes: '양재 IC 진입 전 합류 구간 차선 변경 주의',
    vehicleWaitingNotes: '양재시민의숲 공영주차장',
    cautionNotes: '9인승 이상 승용/승합차량에 6인 이상 실제 탑승 시에만 전용차로 주행 가능! 위반 시 벌점 30점 및 범칙금 부과.',
    additionalNotes: '스프린터 11인승/13인승도 6인 이상 탑승 조건 필수 준수. 단독 운행 시 1차로 주행 절대 금지.',
    updatedAt: '2026-10-28T16:00:00Z',
    updatedBy: '본사 안전관리팀',
  },
  {
    id: 'fk-08',
    title: '강남 주요 레스토랑',
    subtitle: '주차 안내',
    category: '식당',
    categoryBadge: '식당',
    description: '청담·도산공원 파인다이닝 및 미슐랭 레스토랑 진입 동선 가이드',
    imageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
    photos: [
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
    ],
    address: '서울 강남구 도산대로 및 압구정로 일대',
    phone: '02-540-1234',
    website: 'https://guide.michelin.com',
    freeParkingNotice: '레스토랑별 발렛파킹 비용 5,000원 ~ 10,000원 별도 발생',
    sprinterWaiting: '도산공원 인근 골목 대기 불가. 언주로 또는 학동사거리 대로변 대기',
    restroomLocation: '각 레스토랑 내부 또는 도산공원 공중화장실',
    pickupLocationNotes: '매장 정문 앞 일시 정차 하차 후 즉시 대로변 이동',
    vehicleWaitingNotes: '압구정로데오역 공영주차장 또는 압구정 까페골목 공영',
    cautionNotes: '골목 주정차 단속 카메라 수시 순찰, 발렛 부스와 사전 조율 필수.',
    additionalNotes: '코스 요리 식사 시간 평균 1시간 30분 ~ 2시간 소요, 기사 식사 시간 확보 조율 권장.',
    updatedAt: '2026-10-28T15:00:00Z',
    updatedBy: '본사 운영팀',
  },
  {
    id: 'fk-09',
    title: '긴급 상황',
    subtitle: '대처 매뉴얼',
    category: '긴급',
    categoryBadge: '대처 매뉴얼',
    description: '차량 고장, 사고, VIP 항공기 연착 및 기상 악화 시 본사 비상 연락망',
    imageUrl: 'https://images.unsplash.com/photo-1584483766114-2cea6facdf57?auto=format&fit=crop&w=800&q=80',
    photos: [
      'https://images.unsplash.com/photo-1584483766114-2cea6facdf57?auto=format&fit=crop&w=800&q=80',
    ],
    address: '서울 강남구 테헤란로 501 본사 핫라인',
    phone: '02-888-9999 (24시간 본사 핫라인)',
    website: 'https://viplimousine.kr',
    freeParkingNotice: '비상 대기 시 비상등 점등 및 삼각대 설치 필수',
    sprinterWaiting: '갓길 안전지대 또는 가장 가까운 고속도로 졸음쉼터',
    restroomLocation: '인근 휴게소 또는 주유소',
    pickupLocationNotes: '사고 즉시 탑승객 안전 확보 후 본사 배차실로 즉시 타전',
    vehicleWaitingNotes: '대체 차량 30분 내 급파 지원 (예비 기사 2명 상시대기)',
    cautionNotes: 'VIP 탑승 상태에서 사고 발생 시 고객사 연락 전 본사 컨트롤타워에 1차 보고 원칙.',
    additionalNotes: '항공기 결항/연착 2시간 이상 발생 시 기사 현장 대기 수당 규정 자동 적용.',
    updatedAt: '2026-10-28T14:00:00Z',
    updatedBy: '총괄 대표이사',
  },
  {
    id: 'fk-10',
    title: '그랜드 인터컨티넨탈',
    subtitle: '호텔 안내',
    category: '호텔',
    categoryBadge: '호텔',
    description: '테헤란로 삼성역 파르나스타워 연계, 인터컨티넨탈 서울 파르나스',
    imageUrl: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=800&q=80',
    photos: [
      'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=800&q=80',
    ],
    address: '서울 강남구 테헤란로 521',
    phone: '02-555-5656',
    website: 'https://seoul.intercontinental.com',
    freeParkingNotice: '호텔 이용 시 3시간 무료 (단순 회차 20분 무료)',
    sprinterWaiting: '지하 3층 대형차량 전용 주차 슬롯 (층고 2.8m 이하)',
    restroomLocation: '1층 그랜드 델리 옆 및 로비 라운지 뒤편',
    pickupLocationNotes: '파르나스 로비 회전문 앞 드롭오프 존 (발렛 요원 협조)',
    vehicleWaitingNotes: '지하 3층 또는 현대백화점 무역센터점 후문 대기 라인',
    cautionNotes: '삼성역 사거리 유턴 금지 구역 주의, 영동대로 방면 출차 시 직진 신호 준수.',
    additionalNotes: '파르나스타워 오피스 입주사 VIP의 경우 오피스 전용 로비(B1/1F) 사전 확인.',
    updatedAt: '2026-10-28T13:00:00Z',
    updatedBy: '본사 운영팀',
  },
  {
    id: 'fk-11',
    title: '파라다이스 시티',
    subtitle: '호텔 안내',
    category: '호텔',
    categoryBadge: '호텔',
    description: '영종도 복합 아트 리조트, 플라자 및 클럽 크로마 의전 동선',
    imageUrl: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800&q=80',
    photos: [
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800&q=80',
    ],
    address: '인천 중구 영종해안남로321번길 186',
    phone: '1833-8855',
    website: 'https://www.p-city.com',
    freeParkingNotice: '최초 30분 무료 (식음 및 호텔 이용 시 4시간 무료)',
    sprinterWaiting: '야외 플라자 뒤편 지상 대형버스 주차장 (스프린터 장기 대기 최적)',
    restroomLocation: '호텔 로비 황금 페가수스 동상 뒤편 및 플라자 1층',
    pickupLocationNotes: '호텔 메인 로비 정문 드롭오프 존 (비상등 점등)',
    vehicleWaitingNotes: '야외 주차장 C구역 (기사 쉼터 및 휴게 라운지 이용 가능)',
    cautionNotes: '인천공항 고속도로 영종대교 구간 강풍 및 해무 주의.',
    additionalNotes: '카지노 VIP 영접 시 카지노 전용 지하 프라이빗 게이트 사전 배정 요청 필수.',
    updatedAt: '2026-10-28T12:00:00Z',
    updatedBy: '본사 운영팀',
  },
];

/**
 * Get all Field Knowledge items (reads from localStorage with initial fallback)
 */
export function getStoredFieldKnowledge(): FieldKnowledgeItem[] {
  if (typeof window === 'undefined') return INITIAL_FIELD_KNOWLEDGE_ITEMS;
  try {
    const raw = localStorage.getItem(FIELD_KNOWLEDGE_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(FIELD_KNOWLEDGE_STORAGE_KEY, JSON.stringify(INITIAL_FIELD_KNOWLEDGE_ITEMS));
      return INITIAL_FIELD_KNOWLEDGE_ITEMS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return INITIAL_FIELD_KNOWLEDGE_ITEMS;
  } catch (err) {
    console.error('Failed to load field knowledge items from storage:', err);
    return INITIAL_FIELD_KNOWLEDGE_ITEMS;
  }
}

/**
 * Save / Update a single Field Knowledge item (Admin Only)
 */
export function saveFieldKnowledgeItem(item: FieldKnowledgeItem): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getStoredFieldKnowledge();
    const existingIndex = current.findIndex((i) => i.id === item.id);
    let updated: FieldKnowledgeItem[];
    const nowIso = new Date().toISOString();

    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = {
        ...item,
        updatedAt: nowIso,
      };
    } else {
      updated = [
        {
          ...item,
          id: item.id || `fk-${Date.now()}`,
          updatedAt: nowIso,
        },
        ...current,
      ];
    }

    localStorage.setItem(FIELD_KNOWLEDGE_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(FIELD_KNOWLEDGE_CHANGE_EVENT, { detail: { item } }));
  } catch (err) {
    console.error('Failed to save field knowledge item:', err);
  }
}

/**
 * Delete a single Field Knowledge item (Admin Only)
 */
export function deleteFieldKnowledgeItem(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getStoredFieldKnowledge();
    const filtered = current.filter((i) => i.id !== id);
    localStorage.setItem(FIELD_KNOWLEDGE_STORAGE_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent(FIELD_KNOWLEDGE_CHANGE_EVENT, { detail: { id } }));
  } catch (err) {
    console.error('Failed to delete field knowledge item:', err);
  }
}
