/**
 * VIP LIMOUSINE KOREA — 전체 20대 공식 차량 데이터 마스터 (Single Source of Truth)
 *
 * [벤츠 스프린터 투어러 (319 CDI)] 1대: 125호 9982
 * [벤츠 스프린터 319 CDI] 2대: 700호 1458, 125호 8040
 * [벤츠 스프린터 519 CDI] 6대: 703서 2658, 70호 3864, 71두 3338, 73호 2553, 71두 3285, 711하 1058
 * [현대 스타리아 리무진] 4대: 125호 7665, 125호 9037, 142호 8407, 116허 1514
 * [기아 카니발 리무진] 1대: 101호 7681
 * [기아 카니발 하이리무진] 1대: 193호 5336
 * [제네시스 GV80] 1대: 203호 5947
 * [제네시스 G90 리무진] 1대: 102부 4280
 * [제네시스 G90L] 1대: 208호 2269
 * [제네시스 G90] 1대: 125호 8839
 * [벤츠 S560] 1대: 01호 3343
 *
 * 총 20대
 * - 벤츠 스프린터: 9대
 * - 현대 스타리아: 4대
 * - 기아 카니발: 2대
 * - 제네시스: 4대
 * - 벤츠 S560: 1대
 */

export type VehicleCategoryKey = 'sprinter' | 'staria' | 'carnival' | 'genesis' | 's_class';

export interface VipRealVehicle {
  id: string;
  plate: string; // e.g. '125호 9982'
  plateShort: string; // e.g. '9982'
  model: string; // e.g. '벤츠 스프린터 투어러 (319 CDI)'
  modelShort: string; // e.g. '스프린터 투어러 (319 CDI)'
  brand: '벤츠' | '현대' | '기아' | '제네시스';
  category: VehicleCategoryKey;
  categoryLabel: string;
  subType: string;
  capacity: string; // e.g. '13인승', '11인승', '15인승', '7인승', '4인승'
  status: '운행 중' | '차고지 대기' | '정비 중';
  defaultDriver?: string;
  fuelType: '디젤' | '가솔린' | '하이브리드';
}

/**
 * Strips manufacturer/brand prefix from vehicle model for cleaner UI display.
 * E.g., '벤츠 S 560' -> 'S 560', '현대 스타리아 리무진' -> '스타리아 리무진', '제네시스 G90L' -> 'G90L', '기아 카니발' -> '카니발'
 * Preserves the underlying raw model string untouched in the database/state.
 */
export function stripManufacturerName(rawModel: string | undefined | null): string {
  if (!rawModel || rawModel === '-' || rawModel === '미배정') return rawModel || '-';
  return rawModel
    .replace(/^(벤츠|메르세데스-벤츠|Mercedes-Benz|현대|Hyundai|기아|Kia|제네시스|Genesis|BMW)\s+/i, '')
    .trim();
}

export const VIP_REAL_VEHICLES: VipRealVehicle[] = [
  // 1. [벤츠 스프린터 투어러 (319 CDI)] 1대
  {
    id: 'veh-sp-9982',
    plate: '125호 9982',
    plateShort: '9982',
    model: '벤츠 스프린터 투어러 (319 CDI)',
    modelShort: '스프린터 투어러 (319)',
    brand: '벤츠',
    category: 'sprinter',
    categoryLabel: '벤츠 스프린터',
    subType: '투어러 (319 CDI)',
    capacity: '13인승',
    status: '운행 중',
    fuelType: '디젤',
  },

  // 2. [벤츠 스프린터 319 CDI] 2대
  {
    id: 'veh-sp-1458',
    plate: '700호 1458',
    plateShort: '1458',
    model: '벤츠 스프린터 319 CDI',
    modelShort: '스프린터 319 CDI',
    brand: '벤츠',
    category: 'sprinter',
    categoryLabel: '벤츠 스프린터',
    subType: '319 CDI',
    capacity: '11인승',
    status: '운행 중',
    fuelType: '디젤',
  },
  {
    id: 'veh-sp-8040',
    plate: '125호 8040',
    plateShort: '8040',
    model: '벤츠 스프린터 319 CDI',
    modelShort: '스프린터 319 CDI',
    brand: '벤츠',
    category: 'sprinter',
    categoryLabel: '벤츠 스프린터',
    subType: '319 CDI',
    capacity: '11인승',
    status: '차고지 대기',
    fuelType: '디젤',
  },

  // 3. [벤츠 스프린터 519 CDI] 6대
  {
    id: 'veh-sp-2658',
    plate: '703서 2658',
    plateShort: '2658',
    model: '벤츠 스프린터 519 CDI',
    modelShort: '스프린터 519 CDI',
    brand: '벤츠',
    category: 'sprinter',
    categoryLabel: '벤츠 스프린터',
    subType: '519 CDI',
    capacity: '15인승',
    status: '운행 중',
    fuelType: '디젤',
  },
  {
    id: 'veh-sp-3864',
    plate: '70호 3864',
    plateShort: '3864',
    model: '벤츠 스프린터 519 CDI',
    modelShort: '스프린터 519 CDI',
    brand: '벤츠',
    category: 'sprinter',
    categoryLabel: '벤츠 스프린터',
    subType: '519 CDI',
    capacity: '15인승',
    status: '운행 중',
    fuelType: '디젤',
  },
  {
    id: 'veh-sp-3338',
    plate: '71두 3338',
    plateShort: '3338',
    model: '벤츠 스프린터 519 CDI',
    modelShort: '스프린터 519 CDI',
    brand: '벤츠',
    category: 'sprinter',
    categoryLabel: '벤츠 스프린터',
    subType: '519 CDI',
    capacity: '15인승',
    status: '운행 중',
    fuelType: '디젤',
  },
  {
    id: 'veh-sp-2553',
    plate: '73호 2553',
    plateShort: '2553',
    model: '벤츠 스프린터 519 CDI',
    modelShort: '스프린터 519 CDI',
    brand: '벤츠',
    category: 'sprinter',
    categoryLabel: '벤츠 스프린터',
    subType: '519 CDI',
    capacity: '15인승',
    status: '운행 중',
    fuelType: '디젤',
  },
  {
    id: 'veh-sp-3285',
    plate: '71두 3285',
    plateShort: '3285',
    model: '벤츠 스프린터 519 CDI',
    modelShort: '스프린터 519 CDI',
    brand: '벤츠',
    category: 'sprinter',
    categoryLabel: '벤츠 스프린터',
    subType: '519 CDI',
    capacity: '15인승',
    status: '차고지 대기',
    fuelType: '디젤',
  },
  {
    id: 'veh-sp-1058',
    plate: '711하 1058',
    plateShort: '1058',
    model: '벤츠 스프린터 519 CDI',
    modelShort: '스프린터 519 CDI',
    brand: '벤츠',
    category: 'sprinter',
    categoryLabel: '벤츠 스프린터',
    subType: '519 CDI',
    capacity: '15인승',
    status: '운행 중',
    fuelType: '디젤',
  },

  // 4. [현대 스타리아 리무진] 4대
  {
    id: 'veh-st-7665',
    plate: '125호 7665',
    plateShort: '7665',
    model: '현대 스타리아 리무진',
    modelShort: '스타리아 리무진',
    brand: '현대',
    category: 'staria',
    categoryLabel: '현대 스타리아',
    subType: '스타리아 리무진',
    capacity: '7인승',
    status: '운행 중',
    fuelType: '디젤',
  },
  {
    id: 'veh-st-9037',
    plate: '125호 9037',
    plateShort: '9037',
    model: '현대 스타리아 리무진',
    modelShort: '스타리아 리무진',
    brand: '현대',
    category: 'staria',
    categoryLabel: '현대 스타리아',
    subType: '스타리아 리무진',
    capacity: '7인승',
    status: '운행 중',
    fuelType: '디젤',
  },
  {
    id: 'veh-st-8407',
    plate: '142호 8407',
    plateShort: '8407',
    model: '현대 스타리아 리무진',
    modelShort: '스타리아 리무진',
    brand: '현대',
    category: 'staria',
    categoryLabel: '현대 스타리아',
    subType: '스타리아 리무진',
    capacity: '7인승',
    status: '차고지 대기',
    fuelType: '디젤',
  },
  {
    id: 'veh-st-1514',
    plate: '116허 1514',
    plateShort: '1514',
    model: '현대 스타리아 리무진',
    modelShort: '스타리아 리무진',
    brand: '현대',
    category: 'staria',
    categoryLabel: '현대 스타리아',
    subType: '스타리아 리무진',
    capacity: '7인승',
    status: '운행 중',
    defaultDriver: '윤태준',
    fuelType: '디젤',
  },

  // 5. [기아 카니발 리무진] 1대
  {
    id: 'veh-cn-7681',
    plate: '101호 7681',
    plateShort: '7681',
    model: '기아 카니발 리무진',
    modelShort: '카니발 리무진',
    brand: '기아',
    category: 'carnival',
    categoryLabel: '기아 카니발',
    subType: '카니발 리무진',
    capacity: '7인승',
    status: '운행 중',
    fuelType: '가솔린',
  },

  // 6. [기아 카니발 하이리무진] 1대
  {
    id: 'veh-cn-5336',
    plate: '193호 5336',
    plateShort: '5336',
    model: '기아 카니발 하이리무진',
    modelShort: '카니발 하이리무진',
    brand: '기아',
    category: 'carnival',
    categoryLabel: '기아 카니발',
    subType: '카니발 하이리무진',
    capacity: '7인승',
    status: '운행 중',
    fuelType: '가솔린',
  },

  // 7. [제네시스 GV80] 1대
  {
    id: 'veh-gn-5947',
    plate: '203호 5947',
    plateShort: '5947',
    model: '제네시스 GV80',
    modelShort: '제네시스 GV80',
    brand: '제네시스',
    category: 'genesis',
    categoryLabel: '제네시스',
    subType: 'GV80',
    capacity: '4인승',
    status: '운행 중',
    fuelType: '가솔린',
  },

  // 8. [제네시스 G90 리무진] 1대
  {
    id: 'veh-gn-4280',
    plate: '102부 4280',
    plateShort: '4280',
    model: '제네시스 G90 리무진',
    modelShort: 'G90 리무진',
    brand: '제네시스',
    category: 'genesis',
    categoryLabel: '제네시스',
    subType: 'G90 리무진',
    capacity: '4인승',
    status: '운행 중',
    fuelType: '가솔린',
  },

  // 9. [제네시스 G90L] 1대
  {
    id: 'veh-gn-2269',
    plate: '208호 2269',
    plateShort: '2269',
    model: '제네시스 G90L',
    modelShort: 'G90L (롱휠베이스)',
    brand: '제네시스',
    category: 'genesis',
    categoryLabel: '제네시스',
    subType: 'G90L',
    capacity: '4인승',
    status: '운행 중',
    fuelType: '가솔린',
  },

  // 10. [제네시스 G90] 1대
  {
    id: 'veh-gn-8839',
    plate: '125호 8839',
    plateShort: '8839',
    model: '제네시스 G90',
    modelShort: '제네시스 G90',
    brand: '제네시스',
    category: 'genesis',
    categoryLabel: '제네시스',
    subType: 'G90',
    capacity: '4인승',
    status: '차고지 대기',
    fuelType: '가솔린',
  },

  // 11. [벤츠 S560] 1대
  {
    id: 'veh-mb-3343',
    plate: '01호 3343',
    plateShort: '3343',
    model: '벤츠 S560',
    modelShort: '벤츠 S560',
    brand: '벤츠',
    category: 's_class',
    categoryLabel: '벤츠 S560',
    subType: 'S560',
    capacity: '4인승',
    status: '운행 중',
    fuelType: '가솔린',
  },
];

// Summary Category Breakdown (총 20대)
export const VIP_VEHICLE_FLEET_CATEGORIES = [
  {
    id: 'sprinter',
    name: '벤츠 스프린터',
    totalCount: 9,
    activeCount: 7,
    availableCount: 2,
    details: '투어러(319) 1대 · 319 CDI 2대 · 519 CDI 6대',
    plates: ['125호 9982', '700호 1458', '125호 8040', '703서 2658', '70호 3864', '71두 3338', '73호 2553', '71두 3285', '711하 1058'],
  },
  {
    id: 'staria',
    name: '현대 스타리아',
    totalCount: 4,
    activeCount: 3,
    availableCount: 1,
    details: '스타리아 리무진 4대',
    plates: ['125호 7665', '125호 9037', '142호 8407', '116허 1514'],
  },
  {
    id: 'carnival',
    name: '기아 카니발',
    totalCount: 2,
    activeCount: 2,
    availableCount: 0,
    details: '카니발 리무진 1대 · 하이리무진 1대',
    plates: ['101호 7681', '193호 5336'],
  },
  {
    id: 'genesis',
    name: '제네시스',
    totalCount: 4,
    activeCount: 3,
    availableCount: 1,
    details: 'GV80 1대 · G90 리무진 1대 · G90L 1대 · G90 1대',
    plates: ['203호 5947', '102부 4280', '208호 2269', '125호 8839'],
  },
  {
    id: 's_class',
    name: '벤츠 S560',
    totalCount: 1,
    activeCount: 1,
    availableCount: 0,
    details: 'S560 플래그십 세단 1대',
    plates: ['01호 3343'],
  },
];

/**
 * Find vehicle by full plate or partial 4-digit number
 */
export function findVipVehicle(query: string): VipRealVehicle | undefined {
  if (!query) return undefined;
  const clean = query.replace(/\s+/g, '');
  return VIP_REAL_VEHICLES.find(
    (v) =>
      v.plate.replace(/\s+/g, '') === clean ||
      clean.includes(v.plateShort) ||
      v.plate.includes(query)
  );
}

/**
 * Format standard vehicle label (e.g. "현대 스타리아 리무진 (116허 1514)")
 */
export function getVipVehicleLabel(plate: string, fallbackModel?: string): string {
  const match = findVipVehicle(plate);
  if (match) {
    return `${match.model} (${match.plate})`;
  }
  return fallbackModel ? `${fallbackModel} (${plate})` : plate;
}
