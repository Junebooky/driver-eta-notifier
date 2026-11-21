import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const get = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const dispatch = get('components/hq/HqQuickDispatch.tsx');
const driverPicker = get('components/hq/email/HqDriverSelectModal.tsx');
const fleet = get('components/hq/vehicles/HqVehicleManagementView.tsx');
const newVehicle = get('components/hq/vehicles/NewVehicleModal.tsx');

test('four booking actions share the SAME quiet dispatch card button class', () => {
  assert.match(dispatch, /const dispatchQuickActionClass = .*bg-white/);
  assert.match(dispatch, /hover:bg-\[#F5F8FF\]/);
  assert.equal(dispatch.match(/className=\{dispatchQuickActionClass\}/g)?.length, 4);
  assert.match(dispatch, /const dispatchStatusClass = .*bg-\[#F7F9FC\]/);
  assert.equal(dispatch.match(/className=\{dispatchStatusClass\}/g)?.length, 2);
  assert.match(dispatch, /onOpenCustomerMessage\(initialBooking\)/);
  assert.match(dispatch, /onOpenDriverVehicleInfo\(initialBooking\)/);
  assert.match(dispatch, /href=\{driverSmsHref\}/);
  assert.match(dispatch, /onClick=\{handleRemindClick\}/);
});

test('driver selection has fixed height and horizontal swipe pages independent of filters', () => {
  assert.match(driverPicker, /h-\[min\(744px,94dvh\)\]/);
  assert.match(driverPicker, /paginateDriverItems\(filteredDrivers\)/);
  assert.match(driverPicker, /snap-x snap-mandatory/);
  assert.match(driverPicker, /overflow-x-auto overflow-y-hidden/);
  assert.match(driverPicker, /onScroll=\{\(event\) =>/);
  assert.match(driverPicker, /goToPage\(currentPage - 1\)/);
  assert.match(driverPicker, /goToPage\(currentPage \+ 1\)/);
  assert.match(driverPicker, /Math\.floor\(selectedIndex \/ DRIVERS_PER_PAGE\)/);
  assert.match(driverPicker, /setCurrentPage\(0\)/);
  assert.match(driverPicker, /setEnglishOnly/);
  assert.match(driverPicker, /setOnlyAvailable/);
  assert.match(driverPicker, /onSelectDriver\(selected\)/);
});

test('fleet management A-plan keeps data operations and images, replacing hard black/green/strong borders', () => {
  assert.match(fleet, /hq-fleet-a space-y-5/);
  assert.match(fleet, /aria-pressed=\{isSelected\}/);
  assert.match(fleet, /bg-\[#F3F7FF\]/);
  assert.match(fleet, /shadow-\[0_6px_20px_rgba\(35,49,78,0\.055\)/);
  assert.match(fleet, /getVehicleHero\(selectedVehicle\)/);
  assert.match(fleet, /getVehicleImage\(vehicle\)/);
  assert.match(fleet, /setSelectedCategory/);
  assert.match(fleet, /setFuelFilter/);
  assert.match(fleet, /setIsStatusDropdownOpen/);
  assert.match(fleet, /handleSaveEdit/);
  assert.match(fleet, /handleConfirmDeleteVehicle/);
  assert.match(fleet, /setIsCalendarModalOpen\(true\)/);
  assert.match(fleet, /<NewVehicleModal/);
  assert.doesNotMatch(fleet, /#0050FF|bg-slate-900|bg-emerald-|shadow-2xl/);
});

test('new vehicle registration keeps original actions and uses a single blue CTA', () => {
  assert.match(newVehicle, /onSubmit=\{handleSubmit\}/);
  assert.match(newVehicle, /setPhotoMode\('library'\)/);
  assert.match(newVehicle, /setPhotoMode\('upload'\)/);
  assert.match(newVehicle, /setCapacity\(cap\)/);
  assert.match(newVehicle, /bg-\[#EEF3FF\] text-\[#1E60F3\]/);
  assert.doesNotMatch(newVehicle, /#0050FF|bg-slate-900|shadow-2xl/);
});
