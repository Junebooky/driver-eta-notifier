import test from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { DISPATCH_CARD_DIMENSIONS } from '@/lib/dispatchCards/renderDispatchCard';
import {
  GOLD_WAVE_IMAGE,
  GOLD_WAVE_OPACITY,
  GOLD_WAVE_REGIONS,
  calculateGoldWaveCoverRect,
} from '@/lib/dispatchCards/goldWaveLayout';

test('the uploaded 2172x724 WebP art is included in the branch', () => {
  assert.equal(GOLD_WAVE_IMAGE, '/images/dispatch_cards/backgrounds/gold_wave.webp');
  assert.match(GOLD_WAVE_IMAGE, /^\/images\/dispatch_cards\/backgrounds\/[^/]+\.webp$/);
  assert.ok(statSync(join(process.cwd(), 'public', GOLD_WAVE_IMAGE)).size > 100_000);
});

test('both card formats use 13% alpha, top original and footer horizontally flipped', () => {
  assert.equal(GOLD_WAVE_OPACITY, 0.13);
  for (const orientation of ['pc', 'mobile'] as const) {
    const card = DISPATCH_CARD_DIMENSIONS[orientation];
    const areas = GOLD_WAVE_REGIONS[orientation];
    assert.equal(areas.top.flipX, false);
    assert.equal(areas.bottom.flipX, true);
    assert.equal(areas.top.x, 0);
    assert.equal(areas.bottom.x, 0);
    assert.equal(areas.top.w, card.width);
    assert.equal(areas.bottom.w, card.width);
    assert.ok(areas.top.y >= 16);
    assert.ok(areas.top.y + areas.top.h <= orientation === 'pc' ? 288 : 272);
    assert.ok(areas.bottom.y > orientation === 'pc' ? 1120 : 1588);
    // Keep both golden beams (top 17px, bottom 16px) untouched.
    assert.ok(areas.bottom.y + areas.bottom.h <= card.height - 16);
  }
});

test('gold wave uses a nondistorted 3:1 cover crop in both header/footer frames', () => {
  for (const orientation of ['pc', 'mobile'] as const) {
    const config = GOLD_WAVE_REGIONS[orientation];
    for (const area of [config.top, config.bottom]) {
      const rect = calculateGoldWaveCoverRect(2172, 724, area);
      const tolerance = 1e-7;
      assert.ok(Math.abs(rect.w / rect.h - 3) < tolerance);
      assert.ok(rect.x <= area.x + tolerance);
      assert.ok(rect.y <= area.y + tolerance);
      assert.ok(rect.x + rect.w >= area.x + area.w - tolerance);
      assert.ok(rect.y + rect.h >= area.y + area.h - tolerance);
    }
  }
  assert.throws(
    () => calculateGoldWaveCoverRect(0, 724, GOLD_WAVE_REGIONS.pc.top),
    /올바르지 않습니다/,
  );
});
