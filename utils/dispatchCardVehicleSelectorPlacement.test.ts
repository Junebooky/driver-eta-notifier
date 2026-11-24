import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const component = readFileSync(
  join(process.cwd(), 'components/hq/drivers/HqDispatchCardBuilderModal.tsx'), 'utf8',
);

test('dispatch-card vehicle selector lives inside the preview card, above the rendered image', () => {
  const preview = component.indexOf('>완성 카드 미리보기</h3>');
  const selector = component.indexOf('label="미리보기 차량 선택"');
  const rendered = component.indexOf('<img src={previewUrl}');
  assert.ok(preview >= 0 && selector > preview && rendered > selector);
  assert.equal(component.split('label="미리보기 차량 선택"').length - 1, 1);
  assert.doesNotMatch(component, />차량 선택<\/h3>/);
  assert.match(component, /value=\{vehicle\?\.uuid \|\| ''\}/);
  assert.match(component, /onChange=\{setSelectedVehicleId\}/);
  assert.match(component, /resolveDispatchCardPhotos\(vehicle\)/);
});

test('mobile preview and vehicle selection appear before long settings, with desktop two-column layout', () => {
  const previewPanel = component.indexOf('lg:col-start-2 lg:row-start-1');
  const settings = component.indexOf('lg:col-start-1 lg:row-start-1');
  assert.ok(previewPanel >= 0 && settings > previewPanel);
  assert.match(component, /lg:grid-cols-\[340px_minmax\(0,1fr\)\]/);
  assert.match(component, /<HqCard className="overflow-visible">/);
  assert.match(component, /<HqSegmentedTabs aria-label="배차카드 미리보기 규격"/);
  assert.match(component, /currentCardStatus\?\.pc/);
  assert.match(component, /currentCardStatus\?\.mobile/);
  assert.match(component, /saveAllToAssetLibrary/);
});
