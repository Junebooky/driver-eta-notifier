import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, DELETE } from '../app/api/field-knowledge/route';
import { supabaseAdmin } from '../lib/supabase/server';
import { signCockpitSession } from '../lib/auth/serverAuth';
import { INITIAL_FIELD_KNOWLEDGE_ITEMS } from './fieldKnowledgeData';
import { reviewLegacyFieldKnowledge } from './legacyFieldKnowledgeImport';
import { normalizeKnowledgeItem } from './sharedFieldKnowledge';

const base = { id: 'fk-test-a', title: '테스트 호텔', category: '호텔',
  description: '정문 확인', imageUrl: '/images/icons/knowledge/icon_knowledge.png',
  address: '서울 테스트 1', updatedAt: '', updatedBy: '' };
const org = 'vip_limousine_korea';

const request = (method: string, role: 'hq_admin' | 'driver', value?: unknown) =>
  new NextRequest('http://localhost/api/field-knowledge', {
    method, headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + signCockpitSession({
        userId: role === 'driver' ? 'user-driver' : 'user-admin', org, role,
        driverId: role === 'driver' ? 'driver-id' : undefined,
      }),
    },
    ...(value ? { body: JSON.stringify(value) } : {}),
  });

test('field knowledge protects driver writes, imports once, enforces versions and never seeds examples', async () => {
  const original = supabaseAdmin.from;
  const db = new Map<string, Record<string, any>>();
  const key = (id: string) => org + ':' + id;
  supabaseAdmin.from = ((table: string) => {
    assert.equal(table, 'field_knowledge');
    const filters: Array<[string, unknown]> = [];
    let insertOne: Record<string, unknown> | null = null;
    let batch: Array<Record<string, any>> | null = null;
    let patch: Record<string, unknown> | null = null;
    const selectFields = { names: '' };
    const matches = (r: Record<string, any>) =>
      filters.every(([column, value]) => r[column] === value);
    const execute = async () => {
      if (insertOne) {
        const id = String(insertOne.id);
        if (db.has(key(id))) return { data: null, error: { code: '23505', message: 'duplicate' } };
        const row = { ...insertOne };
        db.set(key(id), row);
        return { data: row, error: null };
      }
      if (batch) {
        const created: Record<string, any>[] = [];
        for (const value of batch) {
          if (db.has(key(value.id))) continue;
          db.set(key(value.id), { ...value });
          created.push({ id: value.id });
        }
        return { data: created, error: null };
      }
      const found = [...db.values()].filter(matches);
      if (patch) {
        if (!found[0]) return { data: null, error: null };
        Object.assign(found[0], patch);
        return { data: found[0], error: null };
      }
      return { data: selectFields.names === 'id,content,version,updated_at,updated_by'
        ? found.map(row => ({ ...row })) : found, error: null };
    };
    const q: Record<string, any> = {};
    q.select = (fields: string) => { selectFields.names = fields; return q; };
    q.eq = (col: string, v: unknown) => { filters.push([col,v]); return q; };
    q.order = () => q;
    q.limit = async () => execute();
    q.single = async () => execute();
    q.maybeSingle = async () => execute();
    q.insert = (v: Record<string, unknown>) => { insertOne = v; return q; };
    q.update = (v: Record<string, unknown>) => { patch = v; return q; };
    q.upsert = (v: Record<string, any>[]) => { batch = v; return q; };
    q.then = (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => execute().then(resolve, reject);
    return q;
  }) as typeof supabaseAdmin.from;

  try {
    const unauth = await GET(new NextRequest('http://localhost/api/field-knowledge'));
    assert.equal(unauth.status, 401);
    assert.equal((await GET(request('GET', 'driver'))).status, 200);
    assert.equal((await POST(request('POST', 'driver', { item: base }))).status, 403);
    const created = await (await POST(request('POST', 'hq_admin', { item: base }))).json();
    assert.equal(created.ok, true);
    assert.equal(created.item.version, 1);
    assert.notEqual(created.item.updatedBy, 'not a server author');
    assert.equal((await POST(request('POST', 'hq_admin', { item: base }))).status, 409);

    const old = await PUT(request('PUT', 'hq_admin', { item: { ...base, title: '변경' }, expectedVersion: 2 }));
    assert.equal(old.status, 409);
    const updated = await (await PUT(request('PUT', 'hq_admin', { item: { ...base, title: '정문 변경' }, expectedVersion: 1 }))).json();
    assert.equal(updated.ok, true);
    assert.equal(updated.item.version, 2);
    const driverData = await (await GET(request('GET', 'driver'))).json();
    assert.equal(driverData.items.length, 1);
    assert.equal(driverData.items[0].title, '정문 변경');

    const imported = await (await POST(request('POST', 'hq_admin', {
      action: 'import', items: [base, { ...base, id: 'fk-test-b', title: '새 거점' }],
    }))).json();
    assert.equal(imported.imported, 1);
    assert.equal(imported.skipped, 1);
    assert.equal(db.get(key(base.id))?.content.title, '정문 변경', 'import never overwrites existing');
    assert.equal((await DELETE(request('DELETE', 'driver', { id: base.id, expectedVersion: 2 }))).status, 403);
    assert.equal((await DELETE(request('DELETE', 'hq_admin', { id: base.id, expectedVersion: 1 }))).status, 409);
    assert.equal((await DELETE(request('DELETE', 'hq_admin', { id: base.id, expectedVersion: 2 }))).status, 200);
    const visible = await (await GET(request('GET', 'driver'))).json();
    assert.deepEqual(visible.items.map((x: any) => x.id), ['fk-test-b']);
  } finally {
    supabaseAdmin.from = original;
  }
});

test('unmodified browser sample guidance is never included in the publish preview', () => {
  const pristine = reviewLegacyFieldKnowledge(JSON.stringify(INITIAL_FIELD_KNOWLEDGE_ITEMS));
  assert.equal(pristine.skippedSamples, INITIAL_FIELD_KNOWLEDGE_ITEMS.length);
  assert.equal(pristine.candidates.length, 0);
  const legacy = reviewLegacyFieldKnowledge(JSON.stringify([
    INITIAL_FIELD_KNOWLEDGE_ITEMS[0],
    { ...INITIAL_FIELD_KNOWLEDGE_ITEMS[1], additionalNotes: '관리자 현장 실측: B2 연결' },
    { ...base, id: 'fk-custom', title: '실제 확인한 곳' },
  ]));
  assert.equal(legacy.skippedSamples, 1);
  assert.equal(legacy.candidates.length, 2);
  assert.equal(reviewLegacyFieldKnowledge('broken').invalid, 1);
  assert.equal(reviewLegacyFieldKnowledge('[]').candidates.length, 0);
});

test('server normalization rejects unsafe URLs, invalid category and injected fields', () => {
  assert.equal(normalizeKnowledgeItem({ ...base, category: '전체' }).ok, false);
  assert.equal(normalizeKnowledgeItem({ ...base, imageUrl: 'javascript:alert(1)' }).ok, false);
  assert.equal(normalizeKnowledgeItem({ ...base, website: 'javascript:alert(1)' }).ok, false);
  assert.equal(normalizeKnowledgeItem({ ...base, photos: ['http://unsafe.example/photo'] }).ok, false);
  const safe = normalizeKnowledgeItem({ ...base, version: 99, updatedBy: 'pretend-admin', unexpected: 'unsafe' });
  assert.equal(safe.ok, true);
  if (safe.ok) {
    assert.equal('unexpected' in safe.item, false);
    assert.equal(safe.item.updatedBy, '');
    assert.equal('version' in safe.item, false);
  }
  const sql = readFileSync(new URL('../supabase/migrations/20261108140500_shared_field_knowledge.sql', import.meta.url), 'utf8');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON cockpit.field_knowledge FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON cockpit.field_knowledge TO service_role/);
  assert.doesNotMatch(sql, /INSERT INTO cockpit.field_knowledge/);
});
