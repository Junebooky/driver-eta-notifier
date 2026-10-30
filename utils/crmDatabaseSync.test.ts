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

test('CRM Full Round-Trip & Quality Gate Test Suite (Zero Live DB Mutation)', async () => {
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
        isFavorite: true,
        department: 'Executive Protocol',
        preferences: ['블랙 세단 선호', '정시 도착 필수'],
        notes: ['기존 CHANEL VIP 의전 계정'],
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
        tier: '주요',
        isFavorite: false,
        department: 'Corporate Protocol',
        preferences: [],
        notes: [],
        contacts: [],
      },
    },
  ];

  let simulateDbError = false;

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
        if (simulateDbError) {
          return { data: null, error: { message: 'Simulated DB internal error' } };
        }
        const found = mockRows.find((r) => (r as any)[filterField!] === filterVal);
        return { data: found ? { ...found } : null, error: found ? null : { message: 'Row not found' } };
      },
      maybeSingle: async () => {
        if (simulateDbError) {
          return { data: null, error: { message: 'Simulated DB internal error' } };
        }
        const found = mockRows.find((r) => (r as any)[filterField!] === filterVal);
        return { data: found ? { ...found } : null, error: null };
      },
      update: (updates: any) => ({
        eq: async (field: string, val: any) => {
          if (simulateDbError) {
            return { data: null, error: { message: 'Simulated DB update failure' } };
          }
          const idx = mockRows.findIndex((r) => (r as any)[field] === val);
          if (idx >= 0) {
            mockRows[idx] = { ...mockRows[idx], ...updates, updated_at: new Date().toISOString() };
            return { data: mockRows[idx], error: null };
          }
          return { data: null, error: { message: 'Row not found for update' } };
        },
      }),
      insert: async (newRow: any) => {
        if (simulateDbError) {
          return { data: null, error: { message: 'Simulated DB insert failure' } };
        }
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
        if (simulateDbError) {
          return Promise.resolve({ data: null, error: { message: 'Simulated DB query failure' } }).then(resolve);
        }
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

    const driverToken = signCockpitSession({
      userId: 'driver-test-user',
      org: 'vip_limousine_korea',
      role: 'driver',
    });

    const makeReq = (method: string, body?: any, token: string = adminToken, query: string = '') => {
      const url = `http://localhost:3000/api/hq/customers${query ? `?${query}` : ''}`;
      return new NextRequest(url, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    };

    // =========================================================================
    // 1. Full Round-Trip Verification: Register New Customer with ALL Fields
    // =========================================================================
    const registerPayload = {
      companyName: '불가리 코리아',
      tier: 'VIP' as const,
      department: '글로벌 이벤트 총괄',
      contactName: '이지은',
      role: '수석 매니저',
      contactPhone: '010-3333-7777',
      contactEmail: 'jieun.lee@bulgari.com',
      preferences: ['스프린터 519 선호', '영어 유창 기사', '정시 피켓팅'],
      notesList: ['VIP 프라이빗 주얼리 쇼 의전', '보안 의전 필수'],
      nextEvent: {
        id: 'ev-bulgari-1',
        title: '2026 하이 주얼리 트렁크쇼',
        date: '2026-11-15',
        dDay: 'D-17',
        location: '신라호텔 영빈관',
        vehiclesRequired: '스프린터 2대',
        passengerCount: 6,
        timeRange: '10:00 - 20:00',
        status: 'upcoming' as const,
      },
      isFavorite: true,
    };

    const registerRes = await POST(makeReq('POST', registerPayload));
    const registerData = await registerRes.json();
    assert.strictEqual(registerRes.status, 200);
    assert.strictEqual(registerData.ok, true);
    assert.strictEqual(registerData.isNewCustomer, true);
    assert.strictEqual(registerData.isNewContact, true);
    assert.ok(registerData.clientId.startsWith('cust-'));
    assert.ok(registerData.contactId.startsWith('c-'));

    // Re-query via GET to verify complete round-trip fidelity
    const getAfterRegister = await GET(makeReq('GET'));
    const getRegisterData = await getAfterRegister.json();
    assert.strictEqual(getAfterRegister.status, 200);
    const savedBulgari = getRegisterData.customers.find((c: any) => c.name === '불가리 코리아');
    assert.ok(savedBulgari, 'Bulgari Korea must exist after registration');
    assert.strictEqual(savedBulgari.tier, 'VIP', 'Tier must match 100%');
    assert.strictEqual(savedBulgari.isFavorite, true, 'isFavorite must match 100%');
    assert.strictEqual(savedBulgari.department, '글로벌 이벤트 총괄', 'Department must match 100%');
    assert.strictEqual(savedBulgari.primaryContactName, '이지은', 'Contact name must match 100%');
    assert.strictEqual(savedBulgari.mainPhone, '010-3333-7777', 'Main phone must match 100%');
    assert.strictEqual(savedBulgari.mainEmail, 'jieun.lee@bulgari.com', 'Main email must match 100%');
    assert.deepStrictEqual(savedBulgari.preferences, ['스프린터 519 선호', '영어 유창 기사', '정시 피켓팅'], 'Preferences must match 100%');
    assert.deepStrictEqual(savedBulgari.notes, ['VIP 프라이빗 주얼리 쇼 의전', '보안 의전 필수'], 'Notes must match 100%');
    assert.strictEqual(savedBulgari.nextEvent?.title, '2026 하이 주얼리 트렁크쇼', 'NextEvent must match 100%');
    assert.strictEqual(savedBulgari.contacts[0].role, '수석 매니저', 'Contact role must match 100%');

    // Verify NO fake fallback values were injected
    assert.notStrictEqual(savedBulgari.mainPhone, '010-0000-0000', 'Must not have fake phone fallback');
    assert.notStrictEqual(savedBulgari.mainEmail, 'vip@company.com', 'Must not have fake email fallback');

    // =========================================================================
    // 2. Full Round-Trip Verification: Update Customer (Preferences, Notes, Tier)
    // =========================================================================
    const updatePayload = {
      id: savedBulgari.id,
      name: '불가리 코리아 (업데이트)',
      tier: '일반' as const,
      isFavorite: false,
      preferences: ['G90 의전 선호', '생수 에비앙 준비'],
      notes: ['수정된 의전 지침: 공항 게이트 B 대기'],
      department: '리테일 마케팅',
      phone: '02-2056-0000',
      email: 'contact@bulgari.kr',
      contactPerson: '김태희',
    };

    const putRes = await PUT(makeReq('PUT', updatePayload));
    const putData = await putRes.json();
    assert.strictEqual(putRes.status, 200);
    assert.strictEqual(putData.ok, true);

    // Re-query via GET to verify PUT updates were persisted in DB
    const getAfterUpdate = await GET(makeReq('GET'));
    const getUpdateData = await getAfterUpdate.json();
    const updatedBulgari = getUpdateData.customers.find((c: any) => c.id === savedBulgari.id);
    assert.ok(updatedBulgari, 'Updated customer must exist');
    assert.strictEqual(updatedBulgari.name, '불가리 코리아 (업데이트)');
    assert.strictEqual(updatedBulgari.tier, '일반');
    assert.strictEqual(updatedBulgari.isFavorite, false);
    assert.deepStrictEqual(updatedBulgari.preferences, ['G90 의전 선호', '생수 에비앙 준비'], 'Preferences update must persist in DB');
    assert.deepStrictEqual(updatedBulgari.notes, ['수정된 의전 지침: 공항 게이트 B 대기'], 'Notes update must persist in DB');
    assert.strictEqual(updatedBulgari.department, '리테일 마케팅');
    assert.strictEqual(updatedBulgari.mainPhone, '02-2056-0000');
    assert.strictEqual(updatedBulgari.mainEmail, 'contact@bulgari.kr');

    // =========================================================================
    // 3. Favorite Toggle Round-Trip
    // =========================================================================
    const toggleTrue = await PUT(makeReq('PUT', { id: savedBulgari.id, isFavorite: true }));
    assert.strictEqual(toggleTrue.status, 200);
    const getFavTrue = await (await GET(makeReq('GET'))).json();
    assert.strictEqual(getFavTrue.customers.find((c: any) => c.id === savedBulgari.id)?.isFavorite, true);

    const toggleFalse = await PUT(makeReq('PUT', { id: savedBulgari.id, isFavorite: false }));
    assert.strictEqual(toggleFalse.status, 200);
    const getFavFalse = await (await GET(makeReq('GET'))).json();
    assert.strictEqual(getFavFalse.customers.find((c: any) => c.id === savedBulgari.id)?.isFavorite, false);

    // =========================================================================
    // 4. Contact Linking & Deduplication (CHANEL)
    // =========================================================================
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
    assert.strictEqual(existingData.isNewCustomer, false);
    assert.strictEqual(existingData.isNewContact, false, 'Duplicate contact must be linked without recreation');
    assert.strictEqual(existingData.clientId, 'cust-chanel');
    assert.strictEqual(existingData.contactId, 'c-chanel-1');

    // Add NEW contact to CHANEL
    const newContactPost = await POST(
      makeReq('POST', {
        companyName: 'CHANEL',
        contactName: 'Chloe Bernard',
        contactEmail: 'chloe.bernard@chanel.com',
        contactPhone: '010-9999-1234',
        role: '의전 매니저',
      })
    );
    const newContactData = await newContactPost.json();
    assert.strictEqual(newContactPost.status, 200);
    assert.strictEqual(newContactData.isNewCustomer, false);
    assert.strictEqual(newContactData.isNewContact, true);
    assert.strictEqual(newContactData.clientId, 'cust-chanel');

    // =========================================================================
    // 5. Failure Path Tests: 401 Unauthorized, 403 Forbidden, 400 Bad Request
    // =========================================================================
    // 5-A: 401 Unauthorized (Missing token)
    const noTokenReq = makeReq('GET', undefined, '');
    const noTokenRes = await GET(noTokenReq);
    assert.strictEqual(noTokenRes.status, 401, 'Request without token must be rejected with 401');

    // 5-B: 403 Forbidden (Driver role token attempting HQ Admin endpoint)
    const driverReq = makeReq('GET', undefined, driverToken);
    const driverRes = await GET(driverReq);
    assert.strictEqual(driverRes.status, 403, 'Driver accessing HQ Admin must be rejected with 403');

    // 5-C: 400 Bad Request (Missing company name)
    const badReqNoCompany = await POST(makeReq('POST', { companyName: '', contactName: '홍길동' }));
    assert.strictEqual(badReqNoCompany.status, 400);

    // 5-D: 400 Bad Request (Missing contact name)
    const badReqNoContact = await POST(makeReq('POST', { companyName: '유효한 회사', contactName: '' }));
    assert.strictEqual(badReqNoContact.status, 400);

    // 5-E: 400 Bad Request on PUT (Missing customer ID)
    const badPutNoId = await PUT(makeReq('PUT', { name: '새 이름' }));
    assert.strictEqual(badPutNoId.status, 400);

    // 5-F: 404 Not Found on PUT (Nonexistent customer ID)
    const notFoundPut = await PUT(makeReq('PUT', { id: 'cust-nonexistent-999999', name: '새 이름' }));
    assert.strictEqual(notFoundPut.status, 404);

    // 5-G: 403 Forbidden on ?demo=true in production environment
    const prevEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = 'production';
      const demoReq = makeReq('GET', undefined, adminToken, 'demo=true');
      const demoRes = await GET(demoReq);
      assert.strictEqual(demoRes.status, 403, 'Demo mode must be blocked in production');
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
    }

    // =========================================================================
    // 6. DB 500 Failure Simulation Test
    // =========================================================================
    simulateDbError = true;
    try {
      const dbErrGet = await GET(makeReq('GET'));
      assert.strictEqual(dbErrGet.status, 500, 'Database failure on GET must return 500 status');

      const dbErrPost = await POST(makeReq('POST', { companyName: '에러테스트', contactName: '테스터' }));
      assert.strictEqual(dbErrPost.status, 500, 'Database failure on POST must return 500 status');

      const dbErrPut = await PUT(makeReq('PUT', { id: 'cust-chanel', tier: 'VIP' }));
      assert.strictEqual(dbErrPut.status, 500, 'Database failure on PUT must return 500 status');
    } finally {
      simulateDbError = false;
    }

    // =========================================================================
    // 7. Infinite API Loop Prevention: Read Fetch & Storage Silent Mode
    // =========================================================================
    let eventDispatchedCount = 0;
    const fakeListener = () => { eventDispatchedCount++; };

    // Simulate browser window EventTarget
    const originalWindow = (global as any).window;
    const originalLocalStorage = (global as any).localStorage;

    try {
      const mockStorage: Record<string, string> = {};
      const eventListeners: Record<string, Function[]> = {};

      (global as any).window = {
        addEventListener: (event: string, fn: Function) => {
          if (!eventListeners[event]) eventListeners[event] = [];
          eventListeners[event].push(fn);
        },
        removeEventListener: (event: string, fn: Function) => {
          if (eventListeners[event]) {
            eventListeners[event] = eventListeners[event].filter((f) => f !== fn);
          }
        },
        dispatchEvent: (customEvent: any) => {
          const fns = eventListeners[customEvent.type] || [];
          fns.forEach((f) => f(customEvent));
          return true;
        },
      };

      (global as any).localStorage = {
        getItem: (k: string) => mockStorage[k] || null,
        setItem: (k: string, v: string) => { mockStorage[k] = v; },
        removeItem: (k: string) => { delete mockStorage[k]; },
      };

      (global as any).CustomEvent = class {
        type: string;
        detail: any;
        constructor(type: string, opts?: any) {
          this.type = type;
          this.detail = opts?.detail;
        }
      };

      const { saveStoredCustomers, CRM_CUSTOMERS_UPDATE_EVENT } = await import('@/utils/crmCustomerSync');
      (global as any).window.addEventListener(CRM_CUSTOMERS_UPDATE_EVENT, fakeListener);

      // Default (broadcast: false) must NEVER dispatch event
      eventDispatchedCount = 0;
      saveStoredCustomers([savedBulgari as any]);
      assert.strictEqual(eventDispatchedCount, 0, 'saveStoredCustomers by default must not emit broadcast event');

      // Explicit broadcast=false must NEVER dispatch event
      eventDispatchedCount = 0;
      saveStoredCustomers([savedBulgari as any], false);
      assert.strictEqual(eventDispatchedCount, 0, 'saveStoredCustomers with broadcast=false must not emit broadcast event');

      // Explicit broadcast=true MUST dispatch event
      eventDispatchedCount = 0;
      saveStoredCustomers([savedBulgari as any], true);
      assert.strictEqual(eventDispatchedCount, 1, 'saveStoredCustomers with broadcast=true must emit exactly 1 event');

      console.log('✓ Infinite API Loop Prevention: Storage silent mode verified.');
    } finally {
      (global as any).window = originalWindow;
      (global as any).localStorage = originalLocalStorage;
    }

    console.log('✓ All CRM round-trip, full-field persistence, and failure scenario tests passed (0 live DB mutations).');
  } finally {
    // Restore original supabaseAdmin.from
    supabaseAdmin.from = originalFrom;
  }
});
