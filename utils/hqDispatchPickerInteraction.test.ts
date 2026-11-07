import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HqDispatchTimeField } from '../components/hq/ui/HqDispatchTimeField';

const source = readFileSync(new URL('../components/hq/HqQuickDispatch.tsx', import.meta.url), 'utf8');
const timeSource = readFileSync(new URL('../components/hq/ui/HqDispatchTimeField.tsx', import.meta.url), 'utf8');

test('new booking and editing share the same time field; no native time input remains', () => {
  assert.equal((source.match(/<HqDispatchTimeField/g) || []).length, 4);
  assert.equal((source.match(/compact\n/g) || []).length >= 2, true);
  assert.doesNotMatch(source, /type="time"/);
  assert.match(timeSource, /onFocus=\{\(\) => \{ setOpened\(true\)/);
  assert.match(timeSource, /onChange=\{\(event\) => \{/);
  assert.match(timeSource, /onBlur=\{commitTyped\}/);
  assert.match(timeSource, /onClick=\{\(\) => choose\(option\)\}/);
  assert.match(timeSource, /options\.map\(option =>/);
  assert.match(timeSource, /document\.addEventListener\('pointerdown'/);
  assert.match(timeSource, /document\.addEventListener\('keydown'/);
});

test('time field SSR exposes direct-text input and explicit dropdown button', () => {
  const html = renderToStaticMarkup(createElement(HqDispatchTimeField, {
    label: '출발 시간',
    value: '09:15',
    onChange: () => {},
    parseInput: (s: string) => s,
    formatValue: (s: string) => s,
  }));
  assert.match(html, /aria-label="출발 시간 직접 입력"/);
  assert.match(html, /aria-label="출발 시간 목록 열기"/);
  assert.match(html, /type="text"/);
  assert.match(html, /value="09:15"/);
  assert.match(html, /aria-expanded="false"/);
});

test('existing and new dispatch share exactly one picker implementation', () => {
  assert.ok((source.match(/data-card-dropdown-trigger="true"/g) || []).length >= 2);
  assert.match(source, /const renderAllocationSelector = \(allocation: VehicleAllocationItem, index: number\)/);
  assert.match(source, /firstAlloc && renderAllocationSelector\(firstAlloc, 0\)/);
  assert.match(source, /allocations\.map\(\(allocation, index\) => renderAllocationSelector\(allocation, index\)\)/);
  assert.match(source, /initialBooking \? 'relative mt-2' : 'absolute left-0 top-full/);
  assert.match(source, /disabled=\{!v\.isAvailable \|\| !fleet\.data\}/);
  assert.doesNotMatch(source, /setIsVehicleModalOpen|setIsDriverModalOpen|<HqVehicleSelectModal|<HqDriverSelectModal/);
});

test('changing assignment or time still goes through versioned published dispatch validation', () => {
  assert.match(source, /expectedVersion,/);
  assert.match(source, /setPickupTimeOnly\(nextTime\)/);
  assert.match(source, /setEndTime\(nextTime\)/);
  assert.match(source, /selectedVehiclePlate: vehicle \? vehicle\.plate/);
  assert.match(source, /selectedDriver: driver \? driver\.id/);
  assert.match(source, /if \(isPreviouslyPublished\) \{\s+handleSubmit\('published'\)/);
  assert.match(source, /validateDispatchInterval/);
  assert.match(source, /totalLiveConflicts/);
  assert.match(source, /aria-label="스케줄 기준 배차 정보"/);
});
