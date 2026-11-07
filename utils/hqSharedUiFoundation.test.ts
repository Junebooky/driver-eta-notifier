import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HqButton, HqIconButton, HqCard, HqInput, HqBadge, HqSegmentedTabs } from '../components/hq/ui/index';

const r=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=r('app/globals.css');

test('shared primitives expose centralized HQ style variants without tying to business data',()=>{
  const primary=renderToStaticMarkup(React.createElement(HqButton,{variant:'primary',type:'submit'},'기록 저장하기'));
  assert.match(primary,/hq-ui-button/);
  assert.match(primary,/data-variant="primary"/);
  assert.match(primary,/type="submit"/);
  const disabled=renderToStaticMarkup(React.createElement(HqButton,{loading:true},'저장'));
  assert.match(disabled,/disabled=""/);
  assert.match(disabled,/aria-busy="true"/);
  const secondary=renderToStaticMarkup(React.createElement(HqIconButton,{'aria-label':'닫기',variant:'subtle',children:'×'}));
  assert.match(secondary,/aria-label="닫기"/);
  assert.match(secondary,/hq-ui-icon-button/);
  const card=renderToStaticMarkup(React.createElement(HqCard,{tone:'muted'},'메모'));
  assert.match(card,/data-tone="muted"/);
  const field=renderToStaticMarkup(React.createElement(HqInput,{type:'text',placeholder:'받는 분'}));
  assert.match(field,/hq-ui-field/);
  const badge=renderToStaticMarkup(React.createElement(HqBadge,{tone:'warning'},'확인 필요'));
  assert.match(badge,/data-tone="warning"/);
  const tabs=renderToStaticMarkup(React.createElement(HqSegmentedTabs,{'aria-label':'분류',tabs:[{id:'all',label:'전체'},{id:'car',label:'세단'}],value:'car',onValueChange:()=>{}}));
  assert.match(tabs,/role="tablist"/);
  assert.match(tabs,/aria-selected="true"/);
  assert.match(tabs,/tabindex="0"/i);
});

test('one CSS token controls HQ colors, surfaces, radii and shadows, no global button overrides',()=>{
  for(const token of ['--hq-accent: #1E60F3','--hq-surface: #FFFFFF','--hq-ink: #17233B','--hq-shadow-card','--hq-shadow-dialog','--hq-radius-control']){
    assert.ok(css.includes(token),token);
  }
  for(const className of ['.hq-ui-card','.hq-ui-button','.hq-ui-field','.hq-ui-badge','.hq-ui-tabs','.hq-ui-tooltip','.hq-ui-modal-surface']){
    assert.ok(css.includes(className),className);
  }
  assert.match(css,/HQ A-plan design tokens & primitives \(not applied to driver Cockpit or Settings\)/);
});

test('real HQ screens have been incrementally migrated; Settings keeps its original treatment',()=>{
  const header=r('components/hq/HqHeader.tsx');
  const register=r('components/hq/customers/HqCustomerRegisterModal.tsx');
  const edit=r('components/hq/customers/HqCustomerEditModal.tsx');
  const pricing=r('components/hq/quotes/HqOfficialPricingView.tsx');
  const sidebar=r('components/hq/HqSidebar.tsx');
  assert.match(header,/HqIconButton variant="ghost"/);
  assert.match(header,/onRefresh\(\)/);
  assert.match(header,/onOpenNotifications\?\.\(\)/);
  assert.match(register,/HqInput/);
  assert.match(register,/HqSelect/);
  assert.match(register,/HqTextarea/);
  assert.match(register,/HqButton variant="primary"/);
  assert.match(edit,/HqTextarea/);
  assert.match(edit,/HqButton variant="primary"/);
  assert.match(pricing,/HqCard/);
  assert.match(pricing,/HqSegmentedTabs/);
  assert.match(pricing,/onOpenQuoteModal\(item\.vehicleProductCode\)/);
  assert.match(sidebar,/isSettings\s*\?\s*\(isActive \? 'bg-slate-100 text-slate-800'/);
});
