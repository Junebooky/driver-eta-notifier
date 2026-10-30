import { VehicleProductMapping, OfficialTariffVersion, OfficialPublicationStatus } from '@/types/officialPricingHq';

export const OFFICIAL_TARIFF_VERSION: OfficialTariffVersion = 'vlk_2026_initial';

/**
 * Public, Client-Safe SKU Definitions matching cockpit.official_price_cards.
 * ZERO server dependencies (no Supabase, no secrets, no prices).
 */
export const STANDARD_VEHICLE_SKU_MAPPINGS: VehicleProductMapping[] = [
  {
    vehicleProductCode: 'sprinter_519_premium',
    vehicleProductLabel: '벤츠 스프린터 리무진 519 최고급형',
    tier: 'sprinter',
    matchKeywords: ['519 최고급', '519 리무진 최고급', '519 프리미엄', '519 9인승', '519 11인승', '519 12인승', '519 cdi 최고급'],
    capacityNote: '2026년형 9·11·12인승',
    quoteRequired: false,
    notes: '519 일반형/비즈니스/셔틀과 엄격히 분리된 최고급 플래그십 상품',
  },
  {
    vehicleProductCode: 'sprinter_519_standard',
    vehicleProductLabel: '벤츠 스프린터 리무진 519 일반형',
    tier: 'sprinter',
    matchKeywords: ['519 일반', '519 스탠다드', '519 기본'],
    capacityNote: '스프린터 519 일반형 리무진',
    quoteRequired: false,
  },
  {
    vehicleProductCode: 'sprinter_519_business',
    vehicleProductLabel: '벤츠 스프린터 519 비즈니스',
    tier: 'sprinter',
    matchKeywords: ['519 비즈니스', '519 15인승', '519 16인승'],
    capacityNote: '15·16인승 비즈니스 투어',
    quoteRequired: false,
  },
  {
    vehicleProductCode: 'sprinter_519_shuttle',
    vehicleProductLabel: '벤츠 스프린터 519 셔틀',
    tier: 'sprinter',
    matchKeywords: ['519 셔틀'],
    capacityNote: '15·16인승 정기/단기 셔틀 전용',
    quoteRequired: false,
  },
  {
    vehicleProductCode: 'sprinter_319_new_6seat',
    vehicleProductLabel: '벤츠 스프린터 319 신차',
    tier: 'sprinter',
    matchKeywords: ['319 신차', '319 6인승', '319 vip'],
    capacityNote: '2026년형 6인승 VIP 독립 시트',
    quoteRequired: false,
    notes: '519 및 구형 319와 분리된 신차 6인승 상품 (단순 319 입력 시 수동 확인 필요)',
  },
  {
    vehicleProductCode: 'genesis_g90_donghaeng',
    vehicleProductLabel: '제네시스 G90 리무진 (동행)',
    tier: 'genesis',
    matchKeywords: ['g90 동행', '동행', 'g90 리무진 동행', 'g90 lwb 동행'],
    capacityNote: '2026년형 신차 최고급형 동행 의전',
    quoteRequired: false,
    notes: '일반 G90과 별개 요율 적용',
  },
  {
    vehicleProductCode: 'genesis_g90_standard',
    vehicleProductLabel: '제네시스 G90 신차 최고급형',
    tier: 'genesis',
    matchKeywords: ['g90 신차', 'g90 신차 최고급', '제네시스 g90 신차'],
    capacityNote: '2026년형 신차 최고급형',
    quoteRequired: false,
  },
  {
    vehicleProductCode: 'genesis_gv80_new',
    vehicleProductLabel: '제네시스 GV80 신차',
    tier: 'suv',
    matchKeywords: ['gv80', 'gv80 신차', '제네시스 gv80'],
    capacityNote: '2026년형 럭셔리 SUV',
    quoteRequired: false,
  },
  {
    vehicleProductCode: 'hyundai_staria_lounge_limo',
    vehicleProductLabel: '현대 스타리아 라운지 리무진 최고급형',
    tier: 'van',
    matchKeywords: ['스타리아 라운지', '스타리아 리무진', '스타리아 라운지 리무진', '스타리아 7인승', '스타리아 9인승'],
    capacityNote: '7·9인승 최고급형 (단순 스타리아 입력 시 수동 확인 필요)',
    quoteRequired: false,
  },
  {
    vehicleProductCode: 'kia_carnival_hi_limo',
    vehicleProductLabel: '기아 카니발 하이리무진 최고급형',
    tier: 'van',
    matchKeywords: ['카니발 하이리무진', '카니발 하이', '올뉴 카니발 하이리무진', '카니발 4인승 하이'],
    capacityNote: '4세대 올뉴 4·7인승 하이리무진 (일반 카니발과 엄격 분리)',
    quoteRequired: false,
  },
  {
    vehicleProductCode: 'benz_s560',
    vehicleProductLabel: '벤츠 S560',
    tier: 'sedan',
    matchKeywords: ['s560', '벤츠 s560', 's-클래스', 's-class', 's클래스', 'w223'],
    capacityNote: '플래그십 세단 VIP 의전',
    quoteRequired: false,
  },
  {
    vehicleProductCode: 'bus_premium_22',
    vehicleProductLabel: '프리미엄 럭셔리 리무진 버스',
    tier: 'bus',
    matchKeywords: ['22인승', '22인승 버스', '프리미엄 리무진 버스'],
    capacityNote: '22인승',
    quoteRequired: true,
    notes: '가격 상담 전용 (0원 확정 금지)',
  },
  {
    vehicleProductCode: 'bus_limo_28',
    vehicleProductLabel: '리무진 버스',
    tier: 'bus',
    matchKeywords: ['28인승', '28인승 버스', '우등 버스'],
    capacityNote: '28인승',
    quoteRequired: true,
    notes: '가격 상담 전용 (0원 확정 금지)',
  },
  {
    vehicleProductCode: 'bus_45',
    vehicleProductLabel: '버스',
    tier: 'bus',
    matchKeywords: ['45인승', '45인승 버스', '대형 버스'],
    capacityNote: '45인승',
    quoteRequired: true,
    notes: '가격 상담 전용 (0원 확정 금지)',
  },
];

/**
 * Maps raw model string to 2026 SKU.
 * Strict Disambiguation per Item #3:
 * Plain '카니발', '519', '319', 'G90', '스타리아' without explicit trim
 * will NOT be auto-confirmed; they return isAmbiguous: true to prevent mis-quoting.
 */
export function resolveVehicleProductSku(modelInput: string): {
  code: string | null;
  label: string | null;
  isAmbiguous: boolean;
  notes?: string;
} {
  if (!modelInput || !modelInput.trim()) {
    return { code: null, label: null, isAmbiguous: false, notes: '차량 미지정' };
  }

  const clean = modelInput.trim();
  const lower = clean.toLowerCase();

  // 1. Direct SKU code match
  const directMatch = STANDARD_VEHICLE_SKU_MAPPINGS.find(
    (m) => m.vehicleProductCode.toLowerCase() === lower
  );
  if (directMatch) {
    return {
      code: directMatch.vehicleProductCode,
      label: directMatch.vehicleProductLabel,
      isAmbiguous: false,
    };
  }

  // 2. Exact label match
  const labelMatch = STANDARD_VEHICLE_SKU_MAPPINGS.find(
    (m) => m.vehicleProductLabel.toLowerCase() === lower
  );
  if (labelMatch) {
    return {
      code: labelMatch.vehicleProductCode,
      label: labelMatch.vehicleProductLabel,
      isAmbiguous: false,
    };
  }

  // 3. Ambiguous Sprinter 519: if only "519" without tier, do NOT assume premium
  if (lower.includes('519')) {
    if (lower.includes('셔틀') || lower.includes('shuttle')) {
      const m = STANDARD_VEHICLE_SKU_MAPPINGS.find((x) => x.vehicleProductCode === 'sprinter_519_shuttle')!;
      return { code: m.vehicleProductCode, label: m.vehicleProductLabel, isAmbiguous: false };
    }
    if (lower.includes('비즈니스') || lower.includes('business')) {
      const m = STANDARD_VEHICLE_SKU_MAPPINGS.find((x) => x.vehicleProductCode === 'sprinter_519_business')!;
      return { code: m.vehicleProductCode, label: m.vehicleProductLabel, isAmbiguous: false };
    }
    if (lower.includes('일반') || lower.includes('standard') || lower.includes('스탠다드')) {
      const m = STANDARD_VEHICLE_SKU_MAPPINGS.find((x) => x.vehicleProductCode === 'sprinter_519_standard')!;
      return { code: m.vehicleProductCode, label: m.vehicleProductLabel, isAmbiguous: false };
    }
    if (lower.includes('최고급') || lower.includes('프리미엄') || lower.includes('premium')) {
      const m = STANDARD_VEHICLE_SKU_MAPPINGS.find((x) => x.vehicleProductCode === 'sprinter_519_premium')!;
      return { code: m.vehicleProductCode, label: m.vehicleProductLabel, isAmbiguous: false };
    }
    // Ambiguous 519
    return {
      code: null,
      label: clean,
      isAmbiguous: true,
      notes: '스프린터 519 세부 트림(최고급/일반/비즈니스/셔틀) 구분이 필요합니다.',
    };
  }

  // 4. Ambiguous Sprinter 319: require "신차" or "6인승" or "vip"
  if (lower.includes('319')) {
    if (lower.includes('신차') || lower.includes('6인승') || lower.includes('vip')) {
      const m = STANDARD_VEHICLE_SKU_MAPPINGS.find((x) => x.vehicleProductCode === 'sprinter_319_new_6seat')!;
      return { code: m.vehicleProductCode, label: m.vehicleProductLabel, isAmbiguous: false };
    }
    return {
      code: null,
      label: clean,
      isAmbiguous: true,
      notes: '스프린터 319 신차 6인승 독립 시트 여부 확인이 필요합니다.',
    };
  }

  // 5. Ambiguous Carnival: DO NOT auto-assume Hi-Limousine for plain "카니발"
  if (lower.includes('카니발') || lower.includes('carnival')) {
    if (lower.includes('하이') || lower.includes('hi') || lower.includes('리무진')) {
      const m = STANDARD_VEHICLE_SKU_MAPPINGS.find((x) => x.vehicleProductCode === 'kia_carnival_hi_limo')!;
      return { code: m.vehicleProductCode, label: m.vehicleProductLabel, isAmbiguous: false };
    }
    return {
      code: null,
      label: clean,
      isAmbiguous: true,
      notes: '일반 카니발과 카니발 하이리무진 구분이 필요합니다. (자동 하이리무진 확정 금지)',
    };
  }

  // 6. Ambiguous G90: require Donghaeng or New/High spec
  if (lower.includes('g90') || lower.includes('지90')) {
    if (lower.includes('동행') || lower.includes('donghaeng')) {
      const m = STANDARD_VEHICLE_SKU_MAPPINGS.find((x) => x.vehicleProductCode === 'genesis_g90_donghaeng')!;
      return { code: m.vehicleProductCode, label: m.vehicleProductLabel, isAmbiguous: false };
    }
    if (lower.includes('신차') || lower.includes('최고급') || lower.includes('standard')) {
      const m = STANDARD_VEHICLE_SKU_MAPPINGS.find((x) => x.vehicleProductCode === 'genesis_g90_standard')!;
      return { code: m.vehicleProductCode, label: m.vehicleProductLabel, isAmbiguous: false };
    }
    return {
      code: null,
      label: clean,
      isAmbiguous: true,
      notes: '제네시스 G90 동행 리무진과 신차 최고급형 세단 구분이 필요합니다.',
    };
  }

  // 7. Ambiguous Staria: require Lounge/Limousine
  if (lower.includes('스타리아') || lower.includes('staria')) {
    if (lower.includes('라운지') || lower.includes('리무진') || lower.includes('lounge') || lower.includes('limo')) {
      const m = STANDARD_VEHICLE_SKU_MAPPINGS.find((x) => x.vehicleProductCode === 'hyundai_staria_lounge_limo')!;
      return { code: m.vehicleProductCode, label: m.vehicleProductLabel, isAmbiguous: false };
    }
    return {
      code: null,
      label: clean,
      isAmbiguous: true,
      notes: '일반 스타리아와 스타리아 라운지 리무진 구분이 필요합니다.',
    };
  }

  // 8. Other vehicles by specific match keywords
  for (const m of STANDARD_VEHICLE_SKU_MAPPINGS) {
    if (m.matchKeywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return {
        code: m.vehicleProductCode,
        label: m.vehicleProductLabel,
        isAmbiguous: false,
      };
    }
  }

  // 9. Ambiguous: unrecognized model
  return {
    code: null,
    label: clean,
    isAmbiguous: true,
    notes: '2026 공식 요금표 SKU와 일치하는 상품이 없어 관리자 확인이 필요합니다.',
  };
}

