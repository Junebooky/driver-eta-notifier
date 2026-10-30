import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchPlaceInMemory,
  normalizePlaceQuery,
  DEFAULT_VERIFIED_PLACES,
} from '../services/placeResolutionService';

/**
 * Pure helper validating Publish Guard logic (from app/api/schedules/dispatch/route.ts)
 */
function validateDispatchPublishGuard(payload: {
  dispatchStatus: 'draft' | 'published';
  origin: string;
  originAddress?: string;
  originLat?: number | null;
  originLng?: number | null;
  destination: string;
  destinationAddress?: string;
  destinationLat?: number | null;
  destinationLng?: number | null;
  placeVerified?: boolean;
  allowUnverified?: boolean;
}): { canProceed: boolean; error?: string; code?: string } {
  const isPublishing = payload.dispatchStatus === 'published';
  const hasValidCoordinates =
    typeof payload.originLat === 'number' &&
    typeof payload.originLng === 'number' &&
    typeof payload.destinationLat === 'number' &&
    typeof payload.destinationLng === 'number';

  const isUnverified = payload.placeVerified === false || !hasValidCoordinates;

  if (isPublishing && isUnverified && !payload.allowUnverified) {
    return {
      canProceed: false,
      error: '미확인 장소가 포함되어 있어 배차를 발송할 수 없습니다. 주소 및 핀을 확정해주세요.',
      code: 'UNRESOLVED_PLACE_GUARD',
    };
  }

  return { canProceed: true };
}

describe('Phase 2: Verified Place Memory & TMAP Resolution Guard', () => {
  it('1. Normalizes place query strings reliably', () => {
    assert.equal(normalizePlaceQuery('  조선 팰리스 (강남) '), '조선 팰리스 강남');
    assert.equal(normalizePlaceQuery('심텍 [본사]'), '심텍 본사');
    assert.equal(normalizePlaceQuery('INCHEON AIRPORT T2'), 'incheon airport t2');
  });

  it('2. Exact and alias matching from verified place memory', () => {
    // Exact match
    const exactMatch = matchPlaceInMemory('조선팰리스 서울 강남', DEFAULT_VERIFIED_PLACES);
    assert.ok(exactMatch);
    assert.equal(exactMatch?.name, '조선팰리스 서울 강남');
    assert.equal(exactMatch?.lat, 37.5042);
    assert.ok(exactMatch?.entry_gate_notes?.includes('드롭오프'));

    // Alias match: "심텍 본사"
    const simmtechMatch = matchPlaceInMemory('심텍 본사', DEFAULT_VERIFIED_PLACES);
    assert.ok(simmtechMatch);
    assert.equal(simmtechMatch?.name, '심텍 본사 (오창)');
    assert.equal(simmtechMatch?.road_address, '충북 청주시 청원구 오창읍 양청3길 39');

    // Alias match: "인천공항 T2"
    const icnMatch = matchPlaceInMemory('인천공항 T2', DEFAULT_VERIFIED_PLACES);
    assert.ok(icnMatch);
    assert.equal(icnMatch?.name, '인천국제공항 제2여객터미널');
  });

  it('3. Unregistered or ambiguous place returns null from memory (never silent geocode)', () => {
    const unknown = matchPlaceInMemory('새로운 미등록 테크밸리 3호관', DEFAULT_VERIFIED_PLACES);
    assert.equal(unknown, null);
  });

  it('4. Publish Guard blocks live dispatch when place is unverified', () => {
    const unverifiedDispatch = validateDispatchPublishGuard({
      dispatchStatus: 'published',
      origin: '조선팰리스',
      originAddress: '서울 강남구 테헤란로 231',
      originLat: 37.5042,
      originLng: 127.0425,
      destination: '심텍 본사 (미확정)',
      destinationAddress: '',
      destinationLat: null,
      destinationLng: null,
      placeVerified: false,
    });

    assert.equal(unverifiedDispatch.canProceed, false);
    assert.equal(unverifiedDispatch.code, 'UNRESOLVED_PLACE_GUARD');
    assert.ok(unverifiedDispatch.error?.includes('주소 및 핀을 확정해주세요'));
  });

  it('5. Drafts allow saving unverified places for manager review without blocking', () => {
    const draftDispatch = validateDispatchPublishGuard({
      dispatchStatus: 'draft',
      origin: '조선팰리스',
      originAddress: '서울 강남구 테헤란로 231',
      originLat: 37.5042,
      originLng: 127.0425,
      destination: '심텍 본사 (주소 미입력)',
      destinationAddress: '',
      destinationLat: null,
      destinationLng: null,
      placeVerified: false,
    });

    assert.equal(draftDispatch.canProceed, true);
    assert.equal(draftDispatch.error, undefined);
  });

  it('6. Verified places with coordinates pass publish guard safely', () => {
    const verifiedDispatch = validateDispatchPublishGuard({
      dispatchStatus: 'published',
      origin: '조선팰리스 서울 강남',
      originAddress: '서울 강남구 테헤란로 231',
      originLat: 37.5042,
      originLng: 127.0425,
      destination: '심텍 본사 (오창)',
      destinationAddress: '충북 청주시 청원구 오창읍 양청3길 39',
      destinationLat: 36.7118,
      destinationLng: 127.4243,
      placeVerified: true,
    });

    assert.equal(verifiedDispatch.canProceed, true);
    assert.equal(verifiedDispatch.error, undefined);
  });
});
