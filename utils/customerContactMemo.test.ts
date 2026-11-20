import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {NextRequest} from 'next/server';
import {supabaseAdmin} from '@/lib/supabase/server';
import {signCockpitSession} from '@/lib/auth/serverAuth';
import {PATCH} from '@/app/api/hq/customers/route';
import {readPersistedCustomerContacts,updateContactMemoById} from '@/lib/customers/contactMemo';

if(!process.env.COCKPIT_AUTH_SECRET)process.env.COCKPIT_AUTH_SECRET='customer-contact-memo-qa-key-32-characters';
const source=(path:string)=>readFileSync(join(process.cwd(),path),'utf8');

test('individual contact memo updates only the matching contact, preserving company notes and others',()=>{
  const original=[{id:'c1',name:'A',role:'비서',phone:'',email:'',memo:'old'},
    {id:'c2',name:'B',role:'담당자',phone:'',email:'',memo:'untouched'}];
  const changed=updateContactMemoById(original,'c1','주소: 서울 강남구\n주차: B2');
  assert.equal(changed.found,true);
  assert.equal(changed.contacts[0].memo,'주소: 서울 강남구\n주차: B2');
  assert.deepEqual(changed.contacts[1],original[1]);
  assert.equal(original[0].memo,'old');
  assert.equal(updateContactMemoById(original,'missing','x').found,false);
  assert.equal(readPersistedCustomerContacts({
    id:'cust-1',contact_person:'김담당',phone:'010',email:'',
    pricing_preset:{contacts:[]},
  })[0].id,'c-cust-1-1');
});

test('contact memo API checks HQ permission and saves only one contact with optimistic update guard',async()=>{
  const oldFrom=supabaseAdmin.from;
  const row:any={id:'cust-one',contact_person:'담당A',phone:'010',email:'a@example.com',
    updated_at:'2026-11-20T00:00:00.000Z',
    pricing_preset:{notes:['공통 메모'],tier:'VIP',contacts:[
      {id:'a',name:'담당A',role:'담당자',phone:'',email:'',memo:'과거'},
      {id:'b',name:'담당B',role:'비서',phone:'',email:'',memo:'유지'},
    ]}};
  let writes=0;
  supabaseAdmin.from=((table:string)=>{
    assert.equal(table,'customers');
    const filters:[string,unknown][]=[];
    let patch:Record<string,unknown>|null=null;
    const q:any={
      select:()=>q,
      eq:(field:string,value:unknown)=>{filters.push([field,value]);return q;},
      is:(field:string,value:unknown)=>{filters.push([field,value]);return q;},
      update:(updates:Record<string,unknown>)=>{patch=updates;return q;},
      maybeSingle:async()=>{
        if(!filters.every(([field,value])=>row[field]===value))return {data:null,error:null};
        if(patch){Object.assign(row,patch);writes++;return {data:{id:row.id},error:null};}
        return {data:structuredClone(row),error:null};
      },
    };
    return q;
  }) as typeof supabaseAdmin.from;
  const admin=signCockpitSession({userId:'hq-user',role:'hq_admin',org:'vip_limousine_korea'});
  const driver=signCockpitSession({userId:'driver-user',role:'driver',org:'vip_limousine_korea'});
  const request=(body:Record<string,unknown>,token:string)=>new NextRequest('http://localhost/api/hq/customers',{
    method:'PATCH',headers:{'content-type':'application/json',authorization:'Bearer '+token},
    body:JSON.stringify(body),
  });
  try{
    const payload={id:'cust-one',contactId:'a',memo:'자택 주소: 서울시'};
    assert.equal((await PATCH(request(payload,driver))).status,403);
    assert.equal((await PATCH(request({...payload,memo:123},admin))).status,400);
    assert.equal((await PATCH(request({...payload,contactId:'unknown'},admin))).status,404);
    assert.equal(writes,0);
    const response=await PATCH(request(payload,admin));
    assert.equal(response.status,200);
    assert.equal((await response.json()).ok,true);
    assert.equal(row.pricing_preset.contacts[0].memo,'자택 주소: 서울시');
    assert.equal(row.pricing_preset.contacts[1].memo,'유지');
    assert.deepEqual(row.pricing_preset.notes,['공통 메모']);
    assert.equal(row.pricing_preset.tier,'VIP');
    assert.equal(writes,1);
  }finally{supabaseAdmin.from=oldFrom;}
});

test('customer management has four common HQ tabs, top contact notes and no detached duplicate panels',()=>{
  const view=source('components/hq/customers/HqCustomersView.tsx');
  const overview=source('components/hq/customers/HqCustomerOverview.tsx');
  const activity=source('components/hq/customers/HqCustomerActivityPanels.tsx');
  const memo=source('components/hq/customers/HqCustomerContactMemoModal.tsx');
  assert.match(view,/<HqSegmentedTabs aria-label="고객사 상세 정보 탭"/);
  assert.match(view,/label:'운행·행사'/);
  assert.match(view,/label:'경비·정산'/);
  assert.match(view,/label:'요청·소통'/);
  assert.doesNotMatch(view,/id: 'contacts', label: '담당자'/);
  assert.match(view,/<HqCustomerOverview/);
  assert.match(view,/<HqCustomerContactMemoModal/);
  assert.match(overview, /담당자 \(\{customer\.contacts\.length\}\)/);
  assert.match(overview,/고객사 메모/);
  assert.ok(overview.indexOf('담당자 (')<overview.indexOf('최근 요청 사항'));
  assert.ok(overview.indexOf('고객사 메모')<overview.indexOf('최근 운행'));
  assert.match(activity,/<HqCard/);
  assert.match(memo,/<HqModal/);
  assert.match(memo,/<HqTextarea/);
  assert.match(view,/onSave=\{handleSaveContactMemo\}/);
  assert.match(source('app/api/hq/customers/route.ts'),/export async function PATCH/);
});
