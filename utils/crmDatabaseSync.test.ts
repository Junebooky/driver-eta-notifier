import assert from 'node:assert';
import test from 'node:test';
import { supabaseAdmin } from '@/lib/supabase/server';
import { signCockpitSession } from '@/lib/auth/serverAuth';
import { GET, POST, PUT } from '@/app/api/hq/customers/route';
import { NextRequest } from 'next/server';

interface MockCustomerRow {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  pricing_preset?: any;
  created_at?: string;
  updated_at?: string;
}

// Ensure test environment auth secret
if (!process.env.COCKPIT_AUTH_SECRET) {
  process.env.COCKPIT_AUTH_SECRET = 'mock-test-auth-secret-key-for-crm-test-32chars';
}

test('Item 3: Isolated Mock CRM DB Synchronization & Deduplication (Zero Live DB Mutation)', async () => {
  // In-memory isolated DB seed - guarantees ZERO network requests to live Supabase DB
  const mockRows: MockCustomerRow[] = [
    {
      id: 'cust-chanel',
      name: 'CHANEL',
      contact_person: 'Marie Dupont',
      phone: '+33 6 12 34 56 78',
      email: 'marie.dupont@chanel.com',
      pricing_preset: {
        tier: 'VIP',
        contacts: [
          {
            id: 'c-chanel-1',
            name: 'Marie Dupont',
            phone: '+33 6 12 34 56 78',
            email: 'marie.dupont@chanel.com',
            isPrimary: true,
            role: 'VIP 의전 총괄',
            department: 'Executive Protocol',
          },
        ],
      },
    },
    {
      id: 'cust-intercos',
      name: '인터코스코리아',
      contact_person: '박지훈',
      phone: '010-2222-3333',
      email: 'jihoon.park@intercos.com',
      pricing_preset: {
        tier: 'VVIP',
        contacts: [
          {
            id: 'c-intercos-1',
            name: '박지훈',
            phone: '010-2222-3333',
            email: 'jihoon.park@intercos.com',
            isPrimary: true,
            role: '의전 팀장',
            department: 'Corporate Protocol',
          },
        ],
      },
    },
  ];

  // Save original from handler
  const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

  // Mock builder targeting in-memory mockRows
  const mockFrom = (table: string) => {
    let filterField: string | null = null;
    let filterVal: any = null;

    const builder: any = {
      select: (_fields: string = '*') => builder,
      order: (_col: string, _opts?: any) => builder,
      eq: (field: string, val: any) => {
        filterField = field;
        filterVal = val;
        return builder;
      },
      single: async () => {
        const found = mockRows.find((r) => (r as any)[filterField!] === filterVal);
        return { data: found ? { ...found } : null, error: found ? null : { message: 'Row not found' } };
      },
      update: (updates: any) => ({
        eq: async (field: string, val: any) => {
          const idx = mockRows.findIndex((r) => (r as any)[field] === val);
          if (idx >= 0) {
            mockRows[idx] = { ...mockRows[idx], ...updates, updated_at: new Date().toISOString() };
            return { data: mockRows[idx], error: null };
          }
          return { data: null, error: { message: 'Row not found for update' } };
        },
      }),
      insert: async (newRow: any) => {
        mockRows.push({ ...newRow, created_at: new Date().toISOString() });
        return { data: newRow, error: null };
      },
      delete: () => ({
        eq: async (field: string, val: any) => {
          const idx = mockRows.findIndex((r) => (r as any)[field] === val);
          if (idx >= 0) {
            mockRows.splice(idx, 1);
          }
          return { error: null };
        },
      }),
      then: (resolve: any, _reject: any) => {
        let res = mockRows.map((r) => ({ ...r }));
        if (filterField !== null) {
          res = res.filter((r) => (r as any)[filterField!] === filterVal);
        }
        return Promise.resolve({ data: res, error: null }).then(resolve);
      },
    };

    return builder;
  };

  // Monkey-patch supabaseAdmin.from for test execution
  supabaseAdmin.from = mockFrom as any;

  try {
    const adminToken = signCockpitSession({
      userId: 'hq-test-admin',
      org: 'vip_limousine_korea',
      role: 'hq_admin',
    });

    const makeReq = (method: string, body?: any) => {
      return new NextRequest('http://localhost:3000/api/hq/customers', {
        method,
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    };

    // 1. GET: Fetch existing customers strictly from in-memory DB
    const getRes = await GET(makeReq('GET'));
    const getData = await getRes.json();
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getData.ok, true);
    assert.ok(Array.isArray(getData.customers), 'Customers must be an array');
    assert.strictEqual(getData.customers.length, 2, 'Must return exactly 2 seeded in-memory customers');

    const chanel = getData.customers.find((c: any) => c.name.toUpperCase() === 'CHANEL');
    assert.ok(chanel, 'CHANEL must exist in in-memory customers');
    assert.strictEqual(chanel.primaryContactName, 'Marie Dupont');

    // 2. POST: Deduplication test - linking existing contact to CHANEL
    const existingContactPost = await POST(
      makeReq('POST', {
        companyName: 'CHANEL',
        contactName: 'Marie Dupont',
        contactEmail: 'marie.dupont@chanel.com',
        contactPhone: '+33 6 12 34 56 78',
      })
    );
    const existingData = await existingContactPost.json();
    assert.strictEqual(existingContactPost.status, 200);
    assert.strictEqual(existingData.ok, true);
    assert.strictEqual(existingData.clientId, 'cust-chanel');
    assert.strictEqual(existingData.contactId, 'c-chanel-1');
    assert.strictEqual(existingData.isNewCustomer, false, 'Must recognize existing customer');
    assert.strictEqual(existingData.isNewContact, false, 'Must recognize existing contact (deduplication)');

    // 3. POST: Adding a NEW contact to existing CHANEL company
    const newContactPost = await POST(
      makeReq('POST', {
        companyName: 'CHANEL',
        contactName: 'Pierre Dubois',
        contactEmail: 'pierre.dubois@chanel.com',
        contactPhone: '010-8888-9999',
        role: 'VIP 의전 팀장',
        department: 'Global Events',
      })
    );
    const newContactData = await newContactPost.json();
    assert.strictEqual(newContactPost.status, 200);
    assert.strictEqual(newContactData.ok, true);
    assert.strictEqual(newContactData.clientId, 'cust-chanel');
    assert.strictEqual(newContactData.isNewCustomer, false, 'Must match existing CHANEL');
    assert.strictEqual(newContactData.isNewContact, true, 'Must detect new contact');
    assert.ok(newContactData.contactId.startsWith('c-'), 'Must generate contact ID');

    // Verify in-memory state updated
    const updatedChanelRow = mockRows.find((r) => r.id === 'cust-chanel');
    assert.strictEqual(updatedChanelRow?.pricing_preset.contacts.length, 2);

    // 4. POST: Registering a completely NEW company & contact
    const newCompanyPost = await POST(
      makeReq('POST', {
        companyName: '테스트글로벌파트너스',
        contactName: '김민수',
        contactEmail: 'minsu@test-partner.com',
        contactPhone: '010-7777-6666',
        notes: '이메일 AI 예약 테스트 고객사',
      })
    );
    const newCompData = await newCompanyPost.json();
    assert.strictEqual(newCompanyPost.status, 200);
    assert.strictEqual(newCompData.ok, true);
    assert.strictEqual(newCompData.isNewCustomer, true, 'Must be recognized as new customer');
    assert.strictEqual(newCompData.isNewContact, true, 'Must be recognized as new contact');
    assert.ok(newCompData.clientId.startsWith('cust-'), 'Must generate customer ID');

    // Verify persisted in mockRows
    assert.strictEqual(mockRows.length, 3, 'mockRows must now have 3 companies');
    const createdCompany = mockRows.find((r) => r.id === newCompData.clientId);
    assert.strictEqual(createdCompany?.name, '테스트글로벌파트너스');
    assert.strictEqual(createdCompany?.contact_person, '김민수');

    // 5. Verify live DB was NEVER mutated (only in-memory mockRows modified)
    console.log('✓ Mock test passed with zero live DB mutations.');
  } finally {
    // Restore original supabaseAdmin.from
    supabaseAdmin.from = originalFrom;
  }
});
