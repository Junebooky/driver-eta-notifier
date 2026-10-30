import { Client } from 'pg';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

async function main() {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString || !['localhost','127.0.0.1'].includes(new URL(connectionString).hostname)) {
    throw new Error('TEST_DATABASE_URL must point to a disposable localhost Postgres instance.');
  }
  const admin = new Client({ connectionString }); await admin.connect();
  const a = new Client({ connectionString }); const b = new Client({ connectionString });
  try {
    await admin.query(`DO $$ BEGIN
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
    END $$;
    CREATE SCHEMA cockpit;
    GRANT USAGE ON SCHEMA cockpit TO service_role, anon, authenticated;
    CREATE TABLE cockpit.drivers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vehicle_no text UNIQUE, driver_name text, english_available boolean, unavailable_windows jsonb DEFAULT '[]'::jsonb);
    CREATE TABLE cockpit.schedules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vehicle_no text REFERENCES cockpit.drivers(vehicle_no),
      date date NOT NULL, pickup_time time NOT NULL, end_date date, end_time time,
      time_display text NOT NULL DEFAULT '', origin text NOT NULL DEFAULT '', destination text NOT NULL DEFAULT '',
      passenger_name text, passenger_note text, driver_name text, status text DEFAULT 'scheduled',
      operation_status text, schedule_meta jsonb, updated_at timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now(), retained_legacy_column text DEFAULT 'preserved'
    );
    INSERT INTO cockpit.schedules(id,vehicle_no,date,pickup_time,end_date,end_time,passenger_name)
      VALUES('00000000-0000-4000-8000-000000000001',NULL,'2026-12-01','23:00','2026-12-01',NULL,'legacy hold');`);
    await admin.query(readFileSync('supabase/migrations/20261030_atomic_dispatch_and_fleet_schema.sql','utf8'));
    // Running the proposal twice must preserve data and remain valid.
    await admin.query(readFileSync('supabase/migrations/20261030_atomic_dispatch_and_fleet_schema.sql','utf8'));
    await a.connect(); await b.connect();
    await Promise.all([a.query('SET ROLE service_role'),b.query('SET ROLE service_role')]);
    const vehicle = randomUUID(); const driver = randomUUID();
    const envelope = (patch: Record<string, unknown> = {}) => ({ row: {
      id: randomUUID(), org_id: 'vip_limousine_korea', vehicle_no: '100가 0001', vehicle_plate: '100가 0001',
      vehicle_id: vehicle, driver_id: driver, driver_name: '동일이름', date: '2026-12-02', pickup_time: '09:00',
      end_date: '2026-12-02', end_time: '12:00', dispatch_status: 'published', status: 'scheduled',
      schedule_meta: { serviceMode: 'with_driver', privateField: 'retained' }, updated_at: new Date().toISOString(), ...patch,
    }, expected_updated_at: null as string | null, is_update: false });
    const commit = async (client: Client, items: ReturnType<typeof envelope>[], key = randomUUID(), fingerprint = JSON.stringify(items)) => {
      for (const id of new Set(items.map(item => item.row.driver_id).filter(Boolean))) {
        await admin.query('INSERT INTO cockpit.drivers(id) VALUES($1) ON CONFLICT(id) DO NOTHING',[id]);
      }
      return client.query('SELECT cockpit.commit_dispatch_batch($1::jsonb,$2,$3,$4) result', [JSON.stringify(items),key,'vip_limousine_korea',fingerprint]);
    };
    const count = async () => Number((await admin.query('SELECT count(*) FROM cockpit.schedules')).rows[0].count);
    const initialCount = await count();
    // Separate DB connections simulate different Vercel instances; only one can commit.
    const concurrent = await Promise.allSettled([commit(a,[envelope()]),commit(b,[envelope()])]);
    assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1,concurrent.filter(r=>r.status==='rejected').map(r=>(r as PromiseRejectedResult).reason.message).join('; '));
    const failure = concurrent.find(r=>r.status==='rejected') as PromiseRejectedResult;
    assert.equal(failure.reason.code,'23P01');
    assert.equal(await count(),initialCount+1);
    console.log('PASS independent connections: 1 commit / 1 conflict');
    await admin.query('DELETE FROM cockpit.schedules WHERE dispatch_status IS NOT NULL');
    // Same-batch overlaps must roll back earlier inserts too.
    await assert.rejects(commit(a,[envelope(),envelope()]), { code:'23P01' });
    assert.equal(await count(),initialCount);
    console.log('PASS same-batch conflicts: zero partial inserts');
    // The last insert violates a real DB constraint after the first two inserts succeed.
    await assert.rejects(commit(a,[envelope(),envelope({ vehicle_id:randomUUID(),vehicle_plate:'200가 0002',vehicle_no:'200가 0002',driver_id:randomUUID() }),
      envelope({ vehicle_id:randomUUID(),vehicle_plate:'300가 0003',vehicle_no:'300가 0003',driver_id:randomUUID(),origin:null })]), { code:'23502' });
    assert.equal(await count(),initialCount);
    console.log('PASS 3rd-row DB failure: transaction rollback leaves zero new rows');
    const row = envelope(); const requestKey = randomUUID();
    const first = await commit(a,[row],requestKey,'same-input');
    const retry = await commit(b,[{ ...row,row:{...row.row,id:randomUUID()} }],requestKey,'same-input');
    assert.deepEqual(retry.rows,first.rows);
    await assert.rejects(commit(a,[row],requestKey,'changed-input'), { code:'40001' });
    assert.equal(await count(),initialCount+1);
    console.log('PASS idempotent replay and mismatched retry rejection');
    // Updating keeps all omitted columns and checks the original revision.
    const saved = first.rows[0].result[0];
    const update = { row:{ ...row.row,end_time:'13:00' }, is_update:true, expected_updated_at:saved.updated_at };
    await commit(a,[update]);
    assert.equal((await admin.query('SELECT retained_legacy_column FROM cockpit.schedules WHERE id=$1',[row.row.id])).rows[0].retained_legacy_column,'preserved');
    await assert.rejects(commit(b,[{...update,expected_updated_at:'2000-01-01T00:00:00Z'}]), { code:'40001' });
    console.log('PASS update preserves other columns and rejects stale revision');
    // Cross-midnight buffer and unresolved legacy end times.
    await admin.query('DELETE FROM cockpit.schedules');
    await commit(a,[envelope({date:'2026-12-02',pickup_time:'22:00',end_time:'23:30'})]);
    await assert.rejects(commit(b,[envelope({date:'2026-12-03',pickup_time:'00:10',end_date:'2026-12-03',end_time:'02:00'})]), { code:'23P01' });
    await commit(b,[envelope({date:'2026-12-03',pickup_time:'00:30',end_date:'2026-12-03',end_time:'02:00'})]);
    await assert.rejects(commit(a,[envelope({end_time:null})]), { code:'23514' });
    console.log('PASS KST midnight buffer, half-open boundary and missing end time');
    await admin.query('DELETE FROM cockpit.schedules');
    await commit(a,[envelope(),envelope({vehicle_id:randomUUID(),vehicle_no:'200가 0002',vehicle_plate:'200가 0002',driver_id:randomUUID()})]);
    assert.equal(await count(),2);
    console.log('PASS same-name drivers with different UUIDs do not conflict');
    await admin.query('DELETE FROM cockpit.schedules');
    await commit(a,[envelope({schedule_meta:{serviceMode:'vehicle_only'},driver_id:null}),envelope({vehicle_id:randomUUID(),vehicle_no:'200가 0002',vehicle_plate:'200가 0002'})]);
    assert.equal(await count(),2);
    console.log('PASS vehicle-only bookings do not consume a chauffeur');
    await admin.query('DELETE FROM cockpit.schedules');
    // Legacy records predate validation; a missing end is preserved as an open hold.
    await admin.query('ALTER TABLE cockpit.schedules DISABLE TRIGGER guard_dispatch_schedule');
    const legacy = envelope({end_time:null}).row;
    await admin.query('INSERT INTO cockpit.drivers(id) VALUES($1) ON CONFLICT(id) DO NOTHING',[legacy.driver_id]);
    await admin.query(`INSERT INTO cockpit.schedules(id,vehicle_no,vehicle_plate,vehicle_id,driver_id,driver_name,date,pickup_time,end_date,end_time,org_id,dispatch_status)
      VALUES($1,$2,$3,$4,$5,'동일이름','2026-12-01','22:00','2026-12-01',NULL,'vip_limousine_korea','published')`,[legacy.id,legacy.vehicle_no,legacy.vehicle_plate,legacy.vehicle_id,legacy.driver_id]);
    await admin.query('ALTER TABLE cockpit.schedules ENABLE TRIGGER guard_dispatch_schedule');
    await assert.rejects(commit(a,[envelope({date:'2026-12-10',end_date:'2026-12-10'})]),{code:'23P01'});
    assert.equal(await count(),1);
    console.log('PASS legacy unknown end remains an open hold without rewriting the record');
    await admin.query('SET ROLE authenticated');
    await assert.rejects(admin.query('SELECT cockpit.commit_dispatch_batch($1::jsonb,$2,$3,$4)',[JSON.stringify([envelope()]),randomUUID(),'vip_limousine_korea','forbidden']), { code:'42501' });
    await assert.rejects(admin.query('SELECT * FROM cockpit.fleet_vehicle_operations'), { code:'42501' });
    await admin.query('RESET ROLE');
    console.log('PASS authenticated role denied RPC and private state');
    await admin.query('DELETE FROM cockpit.schedules');
    // State persists across independent clients and changes availability guard.
    await a.query(`INSERT INTO cockpit.fleet_vehicle_operations(vehicle_id,organization_id,plate,status,memo,color,updated_by)
      VALUES($1,'vip_limousine_korea','400가 0004','정비 중','검사 대기','검정','test-admin')`,[vehicle]);
    const state = await b.query('SELECT memo FROM cockpit.fleet_vehicle_operations WHERE vehicle_id=$1',[vehicle]);
    assert.equal(state.rows[0].memo,'검사 대기');
    await assert.rejects(commit(b,[envelope({date:'2027-01-01',end_date:'2027-01-01'})]), { code:'23P01' });
    console.log('PASS persistent state shared across clients; maintenance prevents dispatch');
  } finally { await a.end().catch(()=>{}); await b.end().catch(()=>{}); await admin.end(); }
}
main().catch(error=>{ console.error(error); process.exitCode=1; });
