/**
 * Protocol Cockpit - Fuel Calculation & Fallback Intelligence Engine
 * 
 * 1. 차종/유종 불확실성 해소 (Fallback Pipeline)
 *    - 차종명 알파벳 (520i=휘발유, 520d=경유) 자동 매핑
 *    - 혼재 차종 (카니발, 스타리아) 2분할 간편 칩 제공
 *    - 타코미터 레드존 (4,500 RPM vs 6,000 RPM) 판독 자동 감지
 *    - 끝까지 유종을 모를 때 보수적 정산을 위해 '휘발유' 단가 기본 안전 마진 채택
 * 
 * 2. 오피넷 3km 반경 이상치 절사 주유비 계산기
 *    - 서울 시내 극단적 상위 15% 초고가 주유소 자동 제외 (Trimmed Mean)
 *    - 부족 DTE 채우기 위한 권장 주유 금액을 도심 안전 계수(1.15배) 반영
 *    - 5천원/1만원 단위 원터치 칩 산출 (예: [25,000원(권장)])
 */

import { GasStation } from '@/types';

export type FuelType = 'gasoline' | 'diesel';

export interface ModelFuelResolution {
  fuelType: FuelType;
  source: 'model_alphabet' | 'tachometer' | 'mixed_model' | 'fallback_margin' | 'manual';
  reason: string;
  isAmbiguous: boolean;
}

export interface TrimmedMeanResult {
  gasoline: number;
  diesel: number;
  premiumGasoline: number;
  sampleCount: number;
  trimmedCount: number;
}

// Fallback baseline retail prices (KOTRA/Opinet Seoul Metro Average)
export const DEFAULT_FALLBACK_PRICES = {
  gasoline: 1685,
  diesel: 1540,
  premiumGasoline: 1930,
};

/**
 * 1. 차종명 및 모델명 기반 유종 자동 매핑
 */
export function resolveFuelTypeFromModel(modelOrName?: string): ModelFuelResolution {
  if (!modelOrName || !modelOrName.trim()) {
    return {
      fuelType: 'gasoline',
      source: 'fallback_margin',
      reason: '차종 미입력 (보수적 안전마진: 휘발유 기본)',
      isAmbiguous: true,
    };
  }

  const clean = modelOrName.trim().toLowerCase();

  // 1) 혼재 차종 (카니발, 스타리아 등)
  const isMixedModel = /카니발|스타리아|carnival|staria|펠리세이드|palisade|쏘렌토|sorento|싼타페|santafe/i.test(clean);
  if (isMixedModel) {
    if (/디젤|경유|diesel|2\.2/i.test(clean)) {
      return {
        fuelType: 'diesel',
        source: 'model_alphabet',
        reason: '혼재 차종 내 디젤 키워드 감지',
        isAmbiguous: false,
      };
    }
    if (/가솔린|휘발유|gasoline|3\.5/i.test(clean)) {
      return {
        fuelType: 'gasoline',
        source: 'model_alphabet',
        reason: '혼재 차종 내 가솔린 키워드 감지',
        isAmbiguous: false,
      };
    }
    return {
      fuelType: 'gasoline',
      source: 'mixed_model',
      reason: '혼재 차종 (카니발/스타리아) - 선택 칩 확인 권장',
      isAmbiguous: true,
    };
  }

  // 2) BMW / Mercedes / Audi 알파벳 매핑 규칙
  // - 'd' 접미사 (520d, 320d, 530d, e220d, c220d, 40d 등)
  if (/\b\d{2,3}d\b|520d|523d|530d|320d|420d|640d|730d|740d|e220d|c220d|s350d|s400d|디젤|경유|cdi|tdi|crdi/i.test(clean)) {
    return {
      fuelType: 'diesel',
      source: 'model_alphabet',
      reason: '모델명 알파벳 "d" 감지: 경유(디젤) 매핑',
      isAmbiguous: false,
    };
  }

  // - 'i' 접미사 (520i, 530i, 320i, 740i, 420i, e300, c200, g80 등)
  if (/\b\d{2,3}i\b|520i|530i|320i|330i|420i|640i|740i|750i|e200|e250|e300|e350|c200|c300|s450|s500|s580|g80|g90|가솔린|휘발유|gasoline|petrol/i.test(clean)) {
    return {
      fuelType: 'gasoline',
      source: 'model_alphabet',
      reason: '모델명 알파벳 "i" 감지: 휘발유(가솔린) 매핑',
      isAmbiguous: false,
    };
  }

  // 3) 최후의 Fallback: 보수적 정산을 위한 휘발유 기본 채택
  return {
    fuelType: 'gasoline',
    source: 'fallback_margin',
    reason: '유종 미확인 (보수적 안전마진: 휘발유 단가 적용)',
    isAmbiguous: true,
  };
}

/**
 * 타코미터 레드존 RPM 기반 유종 판별
 * - 디젤: 4,000 ~ 5,200 RPM (통상 4,500 RPM)
 * - 가솔린: 5,800 ~ 7,500 RPM (통상 6,000~6,500 RPM)
 */
export function resolveFuelTypeFromTachometer(redlineRpm?: number | null): FuelType | null {
  if (!redlineRpm || isNaN(redlineRpm)) return null;

  if (redlineRpm <= 5200 && redlineRpm >= 3500) {
    return 'diesel';
  }
  if (redlineRpm >= 5500) {
    return 'gasoline';
  }
  return null;
}

/**
 * 2. 오피넷 3km 반경 이상치 절사 (Trimmed Mean) 유가 계산기
 * - 서울 시내 상위 15% 초고가 주유소를 계산 모수에서 자동 제외
 */
export function calculateTrimmedMeanPrices(stations: GasStation[]): TrimmedMeanResult {
  const calcFuel = (fuel: 'gasoline' | 'diesel' | 'premiumGasoline', defaultPrice: number) => {
    const prices = stations
      .map((st) => st.prices?.[fuel] || (fuel === 'gasoline' ? st.prices?.gasoline : undefined))
      .filter((p): p is number => typeof p === 'number' && p > 0)
      .sort((a, b) => a - b);

    if (prices.length === 0) {
      return { mean: defaultPrice, count: 0, trimmed: 0 };
    }

    if (prices.length < 4) {
      const avg = Math.round(prices.reduce((sum, val) => sum + val, 0) / prices.length);
      return { mean: avg, count: prices.length, trimmed: 0 };
    }

    // 상위 15% 초고가 주유소 제외 (Trimmed Mean)
    const trimCount = Math.ceil(prices.length * 0.15);
    const validPrices = prices.slice(0, prices.length - trimCount);
    const trimmedAvg = Math.round(validPrices.reduce((sum, val) => sum + val, 0) / validPrices.length);

    return { mean: trimmedAvg, count: prices.length, trimmed: trimCount };
  };

  const gas = calcFuel('gasoline', DEFAULT_FALLBACK_PRICES.gasoline);
  const die = calcFuel('diesel', DEFAULT_FALLBACK_PRICES.diesel);
  const prem = calcFuel('premiumGasoline', DEFAULT_FALLBACK_PRICES.premiumGasoline);

  return {
    gasoline: gas.mean,
    diesel: die.mean,
    premiumGasoline: prem.mean,
    sampleCount: Math.max(gas.count, die.count),
    trimmedCount: Math.max(gas.trimmed, die.trimmed),
  };
}

