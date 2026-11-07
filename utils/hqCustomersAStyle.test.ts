import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const view=read('components/hq/customers/HqCustomersView.tsx');
const create=read('components/hq/customers/HqCustomerRegisterModal.tsx');
const edit=read('components/hq/customers/HqCustomerEditModal.tsx');
const css=read('app/globals.css');

test('CRM uses white A-plan cards and soft active selections',()=>{
  assert.match(view,/hq-customer-a space-y-5/);
  assert.match(view,/bg-\[#F3F7FF\] shadow-\[0_3px_12px/);
  assert.doesNotMatch(view,/bg-blue-50\/80 border-l-4/);
  assert.doesNotMatch(view,/md:col-span-2 bg-gradient-to-r/);
  assert.match(view,/setSelectedCustomerId\(cust\.id\)/);
  assert.match(view,/setIsRegisterModalOpen\(true\)/);
  assert.match(view,/handleToggleFavorite\(cust\.id, e\)/);
  assert.match(view,/setTierFilter\(/);
  assert.match(view,/setActiveTab\(/);
});

test('customer creation/editing remove blue-black gradient headers without altering submit flows',()=>{
  for(const modal of [create,edit]){
    assert.match(modal,/hq-customer-modal-a/);
    assert.doesNotMatch(modal,/bg-gradient-to-r from-\[#0B1E48\]/);
    assert.doesNotMatch(modal,/shadow-2xl/);
    assert.match(modal,/bg-white/);
    assert.match(modal,/onClose/);
  }
  assert.match(create,/onSubmit=\{handleSubmit\}/);
  assert.match(edit,/onSubmit=\{handleSave\}/);
  assert.match(create,/setContactEmail\(e\.target\.value\)/);
  assert.match(edit,/setNotesText\(e\.target\.value\)/);
  assert.match(css,/HQ Customer CRM A-plan/);
  assert.match(css,/\.hq-customer-modal-a :is\(input:not\(\[type="checkbox"\]\), select, textarea\)/);
});
