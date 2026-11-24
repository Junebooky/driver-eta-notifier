import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {NextRequest} from 'next/server';
import {supabaseAdmin} from '@/lib/supabase/server';
import {signCockpitSession} from '@/lib/auth/serverAuth';
import {formatPhoneNumber} from '@/utils/formatters';
import {PATCH} from '@/app/api/hq/customers/route';
import {
  contactPhones,contactEmails,draftFromContact,normalizeContactChannels,updateContactDetails,
} from '@/lib/customers/contactChannels';

if(!process.env.COCKPIT_AUTH_SECRET)process.env.COCKPIT_AUTH_SECRET='contact-multi-edit-tests-secret-key-32-chars';
const src=(file:string)=>readFileSync(join(process.cwd(),file),'utf8');

test('legacy single phone and email are editable; ordered multiple channels retain the preferred first',()=>{
  const legacy={id:'c1',name:'최상현',role:'부장',phone:'010-1111-2222',email:'',memo:'주소: B2'};
  assert.deepEqual(contactPhones(legacy),['010-1111-2222']);
  assert.deepEqual(contactEmails(legacy),[]);
  assert.deepEqual(draftFromContact(legacy).emails,['']);
  const valid=normalizeContactChannels({
    name:' 최상현 ',role:' 실장 ',department:' 의전 ',
    phones:['010-1111-2222','02-123-4567','010-1111-2222',''],
    emails:['New@Example.com','new@example.com','second@example.com'],
  });
  assert.equal(valid.ok,true);
  if(!valid.ok)return;
  assert.deepEqual(valid.value.phones,['010-1111-2222','02-123-4567']);
  assert.deepEqual(valid.value.emails,['new@example.com','second@example.com']);
  const updated=updateContactDetails([legacy,{...legacy,id:'c2',name:'다른 담당자'}],'c1',valid.value);
  assert.equal(updated.found,true);
  assert.equal(updated.contacts[0].phone,'010-1111-2222');
  assert.equal(updated.contacts[0].email,'new@example.com');
  assert.deepEqual(updated.contacts[0].phones,['010-1111-2222','02-123-4567']);
  assert.equal(updated.contacts[0].memo,'주소: B2');
  assert.equal(updated.contacts[1].name,'다른 담당자');
  assert.equal(updated.contacts[1].email,'');
  assert.equal(legacy.email,'');
});

test('add and edit contact phone inputs automatically insert Korean hyphens',()=>{
  const fields=src('components/hq/customers/HqContactChannelFields.tsx');
  const add=src('components/hq/customers/HqCustomerAddContactModal.tsx');
  const edit=src('components/hq/customers/HqCustomerEditContactModal.tsx');
  assert.match(fields,/formatPhoneNumber\(entered\)/);
  assert.match(fields,/onChange=\{event=>isPhone\?handlePhoneChange\(event,index\):setItem\('emails',index,event\.target\.value\)\}/);
  assert.match(fields,/setItem\('phones',index,formatted\)/);
  assert.match(fields,/inputMode=\{isPhone\?'tel':'email'\}/);
  assert.match(add,/<HqContactChannelFields/);
  assert.match(edit,/<HqContactChannelFields/);
  assert.equal(formatPhoneNumber('01012345678'),'010-1234-5678');
  assert.equal(formatPhoneNumber('0101234'),'010-1234');
  assert.equal(formatPhoneNumber('010-1234-5678'),'010-1234-5678');
  assert.equal(formatPhoneNumber('0212345678'),'02-1234-5678');
  assert.equal(formatPhoneNumber('0319876543'),'031-987-6543');
  assert.equal(formatPhoneNumber('+82 10 1234 5678'),'+82 10 1234 5678');
  assert.equal(normalizeContactChannels({
    name:'담당자',role:'부장',department:'',
    phones:[formatPhoneNumber('01012345678')],emails:[],
  }).ok,true);
});

test('input validation rejects invalid emails, phone injection, and overflowing arrays',()=>{
  const base={name:'최상현',role:'부장',department:'',phones:['+82 10 1234 5678'],emails:[]};
  assert.equal(normalizeContactChannels(base).ok,true);
  assert.equal(normalizeContactChannels({...base,phones:['mailto:test@x.com']}).ok,false);
  assert.equal(normalizeContactChannels({...base,emails:['not-an-email']}).ok,false);
  assert.equal(normalizeContactChannels({...base,phones:Array(11).fill('010-1234-5678')}).ok,false);
  assert.equal(normalizeContactChannels({...base,name:'  '}).ok,false);
});

test('PATCH edits one existing contact, preserves memo/other contacts and syncs representative fields',async()=>{
  const oldFrom=supabaseAdmin.from;
  const row:any={
    id:'company1',updated_at:'2026-11-20T05:00:00.000Z',
    contact_person:'대표 담당자',phone:'010-0000-0000',email:'',
    pricing_preset:{tier:'VIP',notes:['고객사 공통'],preferences:['호텔 앞 대기'],
      contacts:[
        {id:'main',name:'대표 담당자',role:'총괄',department:'비서실',
          phone:'010-0000-0000',email:'',isPrimary:true,memo:'기존 메모'},
        {id:'second',name:'비서',role:'팀원',department:'',phone:'010-9999-9999',
          email:'second@example.com',memo:'변경 금지'},
      ]},
  };
  let writes=0;
  supabaseAdmin.from=((table:string)=>{
    assert.equal(table,'customers');
    const filters:[string,unknown][]=[];
    let change:Record<string,unknown>|null=null;
    const q:any={
      select:()=>q,
      eq:(column:string,value:unknown)=>{filters.push([column,value]);return q;},
      is:(column:string,value:unknown)=>{filters.push([column,value]);return q;},
      update:(value:Record<string,unknown>)=>{change=value;return q;},
      maybeSingle:async()=>{
        if(!filters.every(([column,value])=>row[column]===value))
          return {data:null,error:null};
        if(change){Object.assign(row,change);writes++;return {data:{id:row.id},error:null};}
        return {data:structuredClone(row),error:null};
      },
    };
    return q;
  }) as typeof supabaseAdmin.from;
  const admin=signCockpitSession({userId:'hq-test',org:'vip_limousine_korea',role:'hq_admin'});
  const driver=signCockpitSession({userId:'driver-test',org:'vip_limousine_korea',role:'driver'});
  const make=(contact:Record<string,unknown>,token=admin,contactId='main')=>
    new NextRequest('http://localhost:3000/api/hq/customers',{
      method:'PATCH',headers:{authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({id:'company1',contactId,contact}),
    });
  try{
    const details={name:'대표 담당자 수정',role:'이사',department:'의전',
      phones:['010-2222-3333','02-100-2000'],emails:['first@example.com','second@company.com']};
    assert.equal((await PATCH(make(details,driver))).status,403);
    assert.equal((await PATCH(make({...details,emails:['bademail']}))).status,400);
    assert.equal((await PATCH(make(details,admin,'unknown'))).status,404);
    assert.equal(writes,0);
    const response=await PATCH(make(details));
    assert.equal(response.status,200);
    assert.equal((await response.json()).ok,true);
    assert.equal(row.contact_person,'대표 담당자 수정');
    assert.equal(row.phone,'010-2222-3333');
    assert.equal(row.email,'first@example.com');
    assert.deepEqual(row.pricing_preset.contacts[0].phones,details.phones);
    assert.deepEqual(row.pricing_preset.contacts[0].emails,details.emails);
    assert.equal(row.pricing_preset.contacts[0].memo,'기존 메모');
    assert.equal(row.pricing_preset.contacts[1].email,'second@example.com');
    assert.deepEqual(row.pricing_preset.notes,['고객사 공통']);
    assert.equal(row.pricing_preset.tier,'VIP');
    assert.equal(writes,1);

    const other={name:'비서 수정',role:'팀장',department:'운영',
      phones:['010-7777-7777'],emails:['assistant@example.com']};
    const second=await PATCH(make(other,admin,'second'));
    assert.equal(second.status,200);
    assert.equal(row.contact_person,'대표 담당자 수정');
    assert.equal(row.phone,'010-2222-3333');
    assert.equal(row.email,'first@example.com');
    assert.equal(row.pricing_preset.contacts[1].phone,'010-7777-7777');
    assert.equal(row.pricing_preset.contacts[1].memo,'변경 금지');
    assert.equal(writes,2);
  }finally{supabaseAdmin.from=oldFrom;}
});

test('customer UI uses shared HQ add/edit form, multiple methods and edit by stable contact ID',()=>{
  const overview=src('components/hq/customers/HqCustomerOverview.tsx');
  const fields=src('components/hq/customers/HqContactChannelFields.tsx');
  const add=src('components/hq/customers/HqCustomerAddContactModal.tsx');
  const edit=src('components/hq/customers/HqCustomerEditContactModal.tsx');
  const view=src('components/hq/customers/HqCustomersView.tsx');
  assert.match(overview,/onEditContact\(person\)/);
  assert.match(overview,/contactPhones\(person\)\.map/);
  assert.match(overview,/contactEmails\(person\)\.map/);
  assert.match(fields,/const isPhone=key==='phones',label=isPhone\?'전화번호':'이메일'/);
  assert.match(fields,/onClick=\{\(\)=>addItem\(key\)\}/);
  assert.match(fields,/\{label\} 추가/);
  assert.match(fields,/removeItem/);
  assert.match(fields,/HqInput/);
  assert.match(add,/<HqContactChannelFields/);
  assert.match(edit,/<HqContactChannelFields/);
  assert.match(edit,/<HqModal/);
  assert.match(view,/saveCustomerContactDetailsInDb\(customerId,contactId,details\)/);
  assert.match(view,/<HqCustomerEditContactModal/);
  assert.match(src('app/api/hq/customers/route.ts'),/normalizeContactChannels\(body\.contact\)/);
});
