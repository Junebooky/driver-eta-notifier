import { LocationPreset } from '@/types';

export const DEFAULT_PRESET_LOCATIONS: LocationPreset[] = [
  {
    id: 'icn_t1',
    name: '인천국제공항 제1여객터미널',
    shortName: '인천공항 T1',
    lat: 37.4495,
    lng: 126.4512,
    category: 'AIRPORT',
    address: '인천 중구 공항로 272',
  },
  {
    id: 'icn_t2',
    name: '인천국제공항 제2여객터미널',
    shortName: '인천공항 T2',
    lat: 37.4691,
    lng: 126.4344,
    category: 'AIRPORT',
    address: '인천 중구 제2소화물통로 255',
  },
  {
    id: 'josun_palace',
    name: '조선팰리스 강남',
    shortName: '조선팰리스 강남',
    lat: 37.5042,
    lng: 127.0425,
    category: 'HOTEL',
    address: '서울 강남구 테헤란로 231',
  },
  {
    id: 'signiel_seoul',
    name: '시그니엘 서울',
    shortName: '시그니엘 서울',
    lat: 37.5126,
    lng: 127.1025,
    category: 'HOTEL',
    address: '서울 송파구 올림픽로 300 롯데월드타워',
  },
  {
    id: 'inje_hotel',
    name: '인제스피디움 호텔',
    shortName: '인제스피디움 호텔',
    lat: 38.0051,
    lng: 128.2917,
    category: 'CIRCUIT',
    address: '강원 인제군 기린면 상하답로 130',
  },
  {
    id: 'inje_paddock',
    name: '인제스피디움 피트/패독',
    shortName: '인제 패독',
    lat: 38.0065,
    lng: 128.2930,
    category: 'CIRCUIT',
    address: '강원 인제군 기린면 상하답로 130 패독',
  },
  {
    id: 'hanam_misa_return',
    name: '차량 반납지 (하남/미사)',
    shortName: '차량 반납 (하남/미사)',
    lat: 37.5583,
    lng: 127.1950,
    category: 'RETURN',
    address: '경기 하남시 미사대로',
  },
];

export const PRESET_LOCATIONS = DEFAULT_PRESET_LOCATIONS;
export const DEFAULT_ORIGIN: LocationPreset = DEFAULT_PRESET_LOCATIONS[2]; // 조선팰리스 강남 default origin
export const DEFAULT_DESTINATION: LocationPreset = DEFAULT_PRESET_LOCATIONS[0]; // 인천공항 T1 default destination
