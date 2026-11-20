import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const builder=readFileSync(join(process.cwd(),'components/hq/drivers/HqDispatchCardBuilderModal.tsx'),'utf8');
const compare=readFileSync(join(process.cwd(),'components/hq/drivers/HqDispatchCardCompareModal.tsx'),'utf8');

test('primary dispatch-card builder keeps one large preview and mobile PC/mobile tabs',()=>{
  assert.match(builder, /<HqSegmentedTabs aria-label="배차카드 미리보기 규격"/);
  assert.match(builder, /<img src=\{previewUrl\}/);
  assert.match(builder, /<div className="hidden lg:block">\s*<HqButton variant="secondary" size="sm"/);
  assert.match(builder, /<Columns2 className="size-4" \/> 동시 비교/);
  assert.match(builder, /isOpen=\{isOpen && !compareOpen\}/);
  assert.match(builder, /lg:grid-cols-\[340px_minmax\(0,1fr\)\]/);
  assert.equal(builder.split('label="미리보기 차량 선택"').length-1,1);
  assert.match(builder, /saveAllToAssetLibrary/);
  assert.match(builder, /downloadSingle/);
  assert.match(builder, /downloadAll/);
});
test('comparison is an isolated shared-HQ fullscreen modal, not two mini previews in the main editor',()=>{
  assert.match(builder, /<HqDispatchCardCompareModal/);
  assert.match(builder, /setCompareInputs\(\{\s*pc: buildInput\(vehicle, 'pc'\),\s*mobile: buildInput\(vehicle, 'mobile'\)/);
  assert.match(builder, /isOpen=\{isOpen && compareOpen\}/);
  assert.match(compare, /<HqModal/);
  assert.match(compare, /<HqCard/);
  assert.match(compare, /<HqButton variant="secondary"/);
  assert.match(compare, /max-w-none! h-\[94dvh\] w-full/);
  assert.match(compare, /grid-cols-1 gap-4 lg:grid-cols-2/);
  assert.match(compare, /renderDispatchCard\(inputs\[variant\]\)/);
  assert.match(compare, /for \(const variant of \['pc', 'mobile'\] as const\)/);
  assert.match(compare, /window\.open\(preview, '_blank', 'noopener,noreferrer'\)/);
  assert.match(compare, /URL\.revokeObjectURL\(url\)/);
  assert.doesNotMatch(compare, /supabaseAdmin|\/api\/hq\/drivers\/assets\/upload|saveDriverVehicleInfoAsset/);
});
