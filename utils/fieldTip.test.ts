import {
  getFieldTipsForPlace,
  getFieldTipsCount,
  saveCustomFieldTip,
  JOSUN_PALACE_FIELD_TIPS,
  INCHEON_T1_FIELD_TIPS,
} from './fieldTipData';
import { FieldTipItem } from '@/types/fieldTip';

console.log('--- Running Field Tips Domain Unit Tests ---');

// 1. Verify Predefined Location Matching
const jpData = getFieldTipsForPlace('조선팰리스 강남');
if (jpData.placeName !== '조선팰리스 강남') {
  throw new Error(`Expected 조선팰리스 강남, got ${jpData.placeName}`);
}
if (jpData.tips.length < 4) {
  throw new Error(`Expected at least 4 tips for Josun Palace, got ${jpData.tips.length}`);
}
console.log('✓ Josun Palace Gangnam field tips loaded successfully');

// Check exact reference mockup categories for Josun Palace:
// 1. 무료 주차 30분
// 2. 픽업 위치
// 3. 대형차 진입
// 4. 주정차 유의
const jpTitles = jpData.tips.map((t) => t.title);
if (!jpTitles.includes('무료 주차 30분')) throw new Error('Missing "무료 주차 30분" tip');
if (!jpTitles.includes('픽업 위치')) throw new Error('Missing "픽업 위치" tip');
if (!jpTitles.includes('대형차 진입')) throw new Error('Missing "대형차 진입" tip');
if (!jpTitles.includes('주정차 유의')) throw new Error('Missing "주정차 유의" tip');
console.log('✓ All 4 reference mockup tip cards present in Josun Palace data');

// Check expanded breakdown rows for "무료 주차 30분"
const parkingTip = jpData.tips.find((t) => t.title === '무료 주차 30분');
if (!parkingTip || !parkingTip.details) throw new Error('Missing details for parking tip');
const labels = parkingTip.details.rows.map((r) => r.label);
if (!labels.includes('무료 시간') || !labels.includes('추가 요금') || !labels.includes('적용 구역') || !labels.includes('참고 사항')) {
  throw new Error(`Missing expected labels in parking tip: ${labels.join(', ')}`);
}
console.log('✓ "무료 주차 30분" key-value rows match mockup (무료 시간, 추가 요금, 적용 구역, 참고 사항)');

// 2. Verify Incheon Airport T1 Matching
const icnData = getFieldTipsForPlace('인천공항 T1');
if (icnData.placeName !== '인천공항 T1') {
  throw new Error(`Expected 인천공항 T1, got ${icnData.placeName}`);
}
console.log('✓ Incheon Airport T1 field tips loaded successfully');

// 3. Verify getFieldTipsCount
const count = getFieldTipsCount('조선팰리스 강남');
if (count < 4) throw new Error(`Expected count >= 4, got ${count}`);
console.log(`✓ Field tips count for 조선팰리스 강남: ${count}`);

// 4. Test Fallback Place Handling
const fallbackData = getFieldTipsForPlace('미등록 거점 호텔', '서울 중구');
if (fallbackData.tips.length < 3) {
  throw new Error(`Expected fallback tips, got ${fallbackData.tips.length}`);
}
console.log('✓ Fallback place returns safe default driver field tips');

console.log('All Field Tips Unit Tests Passed Successfully!');
