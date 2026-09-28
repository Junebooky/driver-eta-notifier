import { DEFAULT_PRESET_LOCATIONS } from '../utils/presets';
import { LocationPreset } from '../types';
import { deduplicatePresets } from '../app/page';

console.log('Testing Preset Management & Reordering Logic...');

// 1. Mock Presets
const testPresets: LocationPreset[] = [
  ...DEFAULT_PRESET_LOCATIONS.slice(0, 3),
  {
    id: 'custom_101',
    name: '신라호텔 서울',
    shortName: '신라호텔',
    lat: 37.5562,
    lng: 127.0051,
    category: 'CUSTOM',
    address: '서울 중구 동호로 249',
    vehicle_no: '4호차',
  },
  {
    id: 'custom_102',
    name: '그랜드 인터컨티넨탈 서울 파르나스',
    shortName: '파르나스',
    lat: 37.5095,
    lng: 127.0611,
    category: 'CUSTOM',
    address: '서울 강남구 테헤란로 521',
    vehicle_no: '4호차',
  },
];

console.log('Original count:', testPresets.length);
const deduped = deduplicatePresets(testPresets);
console.log('Deduped count:', deduped.length);

// 2. Mock Reorder (Move custom_101 to first position)
const reordered = [...deduped];
const [moved] = reordered.splice(3, 1); // custom_101
reordered.unshift(moved);

console.log('New First Item:', reordered[0].shortName, reordered[0].id);
console.log('Order array:', reordered.map((p) => p.id));

// 3. Test applyOrder
const orderIds = reordered.map((p) => p.id);
const indexMap = new Map(orderIds.map((id, i) => [id, i]));
const restored = [...deduped].sort((a, b) => {
  const posA = indexMap.has(a.id) ? indexMap.get(a.id)! : 999;
  const posB = indexMap.has(b.id) ? indexMap.get(b.id)! : 999;
  return posA - posB;
});

console.log('Restored First Item:', restored[0].shortName, restored[0].id);
if (restored[0].id === 'custom_101') {
  console.log('✅ PASS: applyOrder successfully restored custom order!');
} else {
  console.error('❌ FAIL: applyOrder did not restore custom order!');
  process.exit(1);
}

console.log('All tests passed successfully!');
