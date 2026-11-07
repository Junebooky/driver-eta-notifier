import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const pricing=read('components/hq/quotes/HqOfficialPricingView.tsx');
const wizard=read('components/hq/quotes/HqQuoteModal.tsx');
const document=read('components/hq/quotes/HqOfficialQuoteDocument.tsx');
const css=read('app/globals.css');

test('official price screen retains vehicle-specific quote action with quiet categories',()=>{
  assert.match(pricing,/hq-pricing-a space-y-5/);
  assert.match(pricing,/onOpenQuoteModal\(item\.vehicleProductCode\)/);
  assert.match(pricing,/onOpenQuoteModal\(\)/);
  assert.match(pricing,/setActiveTab\(tab\.id\)/);
  assert.match(pricing,/displayedVehicles\.map/);
  assert.doesNotMatch(pricing,/bg-\[#1E60F3\] text-white border border-\[#1E60F3\]/);
});
test('4-step quote wizard retains true booking and print/download calculation pathways',()=>{
  assert.match(wizard,/hq-quote-modal-a/);
  assert.match(wizard,/HqOfficialQuoteDocument/);
  assert.match(wizard,/handleConvertToBooking/);
  assert.match(wizard,/handlePrintPdf/);
  assert.match(wizard,/handleSaveQuote/);
  assert.match(wizard,/handleCopyReceipt/);
  assert.match(wizard,/onClick=\{onClose\}/);
  assert.doesNotMatch(wizard,/shadow-2xl/);
  assert.match(css,/Printed official quote document is not changed/);
  assert.ok(document.length>8000);
});
