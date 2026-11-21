import { Client } from 'pg';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { VIP_REAL_VEHICLES } from '../utils/vehicleData';
import {verifyReportCompletion} from './report-completion.integration';
import { verifyDriverReportChat } from './driver-report-chat.integration';
import { verifyReportingFlow } from './reporting-flow.integration';
import { verifyReportLedgerReplacement } from './report-ledger-replace.integration';

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
    CREATE TABLE cockpit.drivers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vehicle_no text UNIQUE, driver_name text, phone text, default_navi text, passenger_name text, driver_meta jsonb, english_available boolean, unavailable_windows jsonb DEFAULT '[]'::jsonb);
    CREATE TABLE cockpit.vehicles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id text NOT NULL DEFAULT 'vip_limousine_korea', plate text NOT NULL UNIQUE,
      plate_short text, model text NOT NULL, model_short text, brand text NOT NULL,
      category text NOT NULL, category_label text NOT NULL,
      sub_type text, capacity text, fuel_type text, status text NOT NULL DEFAULT 'available',
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE SCHEMA auth;
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,not_after timestamptz);
    CREATE TABLE cockpit.schedules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vehicle_no text REFERENCES cockpit.drivers(vehicle_no),
      date date NOT NULL, pickup_time time NOT NULL, end_date date, end_time time,
      time_display text NOT NULL DEFAULT '', origin text NOT NULL DEFAULT '', destination text NOT NULL DEFAULT '',
      passenger_name text, passenger_note text, driver_name text, status text DEFAULT 'scheduled',
      operation_status text, operation_updated_at timestamptz, operation_history jsonb, schedule_meta jsonb, updated_at timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now(), retained_legacy_column text DEFAULT 'preserved'
    );
    INSERT INTO cockpit.schedules(id,vehicle_no,date,pickup_time,end_date,end_time,passenger_name)
      VALUES('00000000-0000-4000-8000-000000000001',NULL,'2026-12-01','23:00','2026-12-01',NULL,'legacy hold');`);
    await verifyDriverReportChat(admin,connectionString);
    await admin.query(readFileSync('supabase/migrations/20261030_atomic_dispatch_and_fleet_schema.sql','utf8'));
    // Running the proposal twice must preserve data and remain valid.
    await admin.query(readFileSync('supabase/migrations/20261030_atomic_dispatch_and_fleet_schema.sql','utf8'));
    await admin.query(readFileSync('supabase/migrations/20261031024614_cockpit_personal_auth.sql','utf8'));
    await admin.query(readFileSync('supabase/migrations/20261031024614_cockpit_personal_auth.sql','utf8'));
    await admin.query(readFileSync('supabase/migrations/20261031033709_reporting_flow_integrity.sql','utf8'));
    await admin.query(readFileSync('supabase/migrations/20261031033709_reporting_flow_integrity.sql','utf8'));
    await admin.query(readFileSync('supabase/migrations/20261031041612_email_dispatch_source_identity.sql','utf8'));
    await admin.query(readFileSync('supabase/migrations/20261101103643_vehicle_custody_integrity.sql','utf8'));
    await admin.query(readFileSync('supabase/migrations/20261101103643_vehicle_custody_integrity.sql','utf8'));
    await admin.query(readFileSync('supabase/migrations/20261102001414_receipt_review_integrity.sql','utf8'));
    await admin.query(readFileSync('supabase/migrations/20261102001414_receipt_review_integrity.sql','utf8'));
    await admin.query(readFileSync('supabase/migrations/20261107221000_fleet_vehicle_registry.sql','utf8'));
    await admin.query(readFileSync('supabase/migrations/20261107221000_fleet_vehicle_registry.sql','utf8'));
    for (const vehicle of VIP_REAL_VEHICLES) {
      await admin.query(
        `INSERT INTO cockpit.vehicles (id, organization_id, plate, plate_short, model, model_short, brand, category, category_label, sub_type, capacity, fuel_type)
         VALUES ($1,'vip_limousine_korea',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [vehicle.uuid, vehicle.plate, vehicle.plateShort, vehicle.model, vehicle.modelShort,
          vehicle.brand, vehicle.category, vehicle.categoryLabel, vehicle.subType,
          vehicle.capacity, vehicle.fuelType],
      );
    }
    await admin.query('SET ROLE authenticated');
    await assert.rejects(admin.query('SELECT * FROM cockpit.vehicles'), { code: '42501' });
    await admin.query('RESET ROLE');
    console.log('PASS existing fleet schema migration and default DB fleet initialized with 20 stable UUIDs');
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
    // Multi-day/vehicle email revision: a changed booking, explicit cancellation,
    // and a replacement car must commit or roll back as one Postgres operation.
    await admin.query('DELETE FROM cockpit.schedules');
    const oldFirst = envelope({ date:'2026-12-07',end_date:'2026-12-07',pickup_time:'09:00',end_time:'12:00' });
    const oldSecond = envelope({
      date:'2026-12-08',end_date:'2026-12-08',pickup_time:'09:00',end_time:'12:00',
      vehicle_id:randomUUID(),vehicle_no:'200가 0002',vehicle_plate:'200가 0002',driver_id:randomUUID(),
    });
    const originals = (await commit(a,[oldFirst,oldSecond])).rows[0].result;
    const editedFirst = { row:{...oldFirst.row,pickup_time:'10:00',end_time:'13:00',version:2},
      expected_updated_at:originals[0].updated_at, is_update:true };
    const cancelledSecond = { row:{
      ...oldSecond.row,dispatch_status:'cancelled',status:'cancelled',version:2,
      schedule_meta:{...oldSecond.row.schedule_meta,dispatchStatus:'cancelled',cancelReason:'고객 수정본에서 2호차 취소'},
    },expected_updated_at:originals[1].updated_at,is_update:true };
    const badReplacement = envelope({
      date:'2026-12-07',end_date:'2026-12-07',pickup_time:'10:30',end_time:'12:30',
    });
    await assert.rejects(commit(a,[editedFirst,cancelledSecond,badReplacement]),{code:'23P01'});
    const rolledBack = await admin.query('SELECT id,pickup_time,dispatch_status FROM cockpit.schedules ORDER BY date');
    assert.equal(rolledBack.rows.length,2);
    assert.equal(String(rolledBack.rows[0].pickup_time).slice(0,8),'09:00:00');
    assert.equal(rolledBack.rows[1].dispatch_status,'published');
    const replacement = envelope({
      date:'2026-12-08',end_date:'2026-12-08',pickup_time:'09:00',end_time:'12:00',
      vehicle_id:oldSecond.row.vehicle_id,vehicle_no:oldSecond.row.vehicle_no,
      vehicle_plate:oldSecond.row.vehicle_plate,driver_id:oldSecond.row.driver_id,
    });
    await commit(b,[editedFirst,cancelledSecond,replacement]);
    const committed = await admin.query(`SELECT id,pickup_time,dispatch_status,schedule_meta->>'cancelReason' AS cancel_reason FROM cockpit.schedules ORDER BY date,id`);
    assert.equal(committed.rows.length,3);
    assert.ok(committed.rows.some(row => row.id === oldFirst.row.id && String(row.pickup_time).slice(0,8)==='10:00:00'));
    assert.ok(committed.rows.some(row => row.id === oldSecond.row.id && row.dispatch_status==='cancelled' && row.cancel_reason==='고객 수정본에서 2호차 취소'));
    assert.ok(committed.rows.some(row => row.id === replacement.row.id && row.dispatch_status==='published'));
    console.log('PASS multi-day/vehicle mixed revision: atomic rollback and explicit cancellation');
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
    const emailMeta={serviceMode:'with_driver',intakeSource:'email',eventId:'email-fixture-one',groupVehicleIndex:1};
    await commit(a,[envelope({schedule_meta:emailMeta})]);
    await assert.rejects(commit(b,[envelope({vehicle_id:randomUUID(),vehicle_plate:'500가 0005',vehicle_no:'500가 0005',driver_id:randomUUID(),schedule_meta:emailMeta})]),{code:'23505'});
    assert.equal(await count(),1);
    console.log('PASS source email/day/slot is unique across independent operators');
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
    const emailKey='email:'+'a'.repeat(64),ipKey='ip:'+'b'.repeat(64);
    for(let i=0;i<8;i++) assert.equal((await a.query('SELECT cockpit.consume_auth_login_attempt($1) allowed',[[emailKey,ipKey]])).rows[0].allowed,true);
    assert.equal((await b.query('SELECT cockpit.consume_auth_login_attempt($1) allowed',[[emailKey,ipKey]])).rows[0].allowed,false);
    await admin.query("UPDATE cockpit.auth_login_attempts SET window_started_at=now()-interval '16 minutes'");
    assert.equal((await b.query('SELECT cockpit.consume_auth_login_attempt($1) allowed',[[emailKey,ipKey]])).rows[0].allowed,true);
    const authId=randomUUID(),userId=randomUUID();
    await admin.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[authId,userId]);
    const active=async()=> (await a.query('SELECT cockpit.is_active_auth_session($1,$2) active',[authId,userId])).rows[0].active;
    assert.equal(await active(),true);
    assert.equal((await b.query('SELECT cockpit.is_active_auth_session($1,$2) active',[authId,randomUUID()])).rows[0].active,false);
    await admin.query("UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=$1",[authId]);assert.equal(await active(),false);
    await admin.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[authId]);
    await b.query('INSERT INTO cockpit.revoked_auth_sessions(session_id,user_id) VALUES($1,$2)',[authId,userId]);assert.equal(await active(),false);
    console.log('PASS database login limit/window, active-session binding, expiry and immediate revocation');
    const profileId=randomUUID();
    await admin.query("INSERT INTO cockpit.drivers(id,vehicle_no,driver_name,driver_meta) VALUES($1,'기존차량','원래 이름','null'::jsonb)",[profileId]);
    await admin.query('CREATE TABLE cockpit.test_driver_assets(id uuid PRIMARY KEY,driver_id uuid REFERENCES cockpit.drivers(id),kind text);');
    await admin.query("INSERT INTO cockpit.test_driver_assets VALUES($1,$2,'면허증'),($3,$2,'운행기록'),($4,$2,'경비')",[randomUUID(),profileId,randomUUID(),randomUUID()]);
    const driverCount=Number((await admin.query('SELECT count(*) FROM cockpit.drivers')).rows[0].count);
    const profile=await a.query('SELECT cockpit.update_driver_profile_by_id($1,$2,$3) result',[profileId,{driver_name:'수정 이름',phone:'010-0000-0000'},{presetOrder:['home']}]);
    assert.equal(profile.rows[0].result.id,profileId);assert.equal(profile.rows[0].result.vehicle_no,'기존차량');assert.deepEqual(profile.rows[0].result.driver_meta,{presetOrder:['home']});
    // A booking can use a different vehicle without copying or replacing the driver's profile/assets.
    await commit(b,[envelope({vehicle_id:randomUUID(),vehicle_no:'다른차량',vehicle_plate:'다른차량',driver_id:profileId,date:'2027-02-01',end_date:'2027-02-01'})]);
    assert.equal(Number((await admin.query('SELECT count(*) FROM cockpit.drivers')).rows[0].count),driverCount);
    assert.equal(Number((await admin.query('SELECT count(*) FROM cockpit.test_driver_assets WHERE driver_id=$1',[profileId])).rows[0].count),3);
    await assert.rejects(a.query('SELECT cockpit.update_driver_profile_by_id($1,$2,$3)',[profileId,{id:randomUUID()},{}]),{code:'22023'});
    await assert.rejects(a.query('SELECT cockpit.update_driver_profile_by_id($1,$2,$3)',[randomUUID(),{phone:'010'},{}]),{code:'22023'});
    await admin.query('SET ROLE authenticated');
    for(const query of ['SELECT * FROM cockpit.drivers','SELECT * FROM cockpit.revoked_auth_sessions',"SELECT cockpit.consume_auth_login_attempt(ARRAY['email:'||repeat('a',64),'ip:'||repeat('b',64)])"])
      await assert.rejects(admin.query(query),{code:'42501'});
    await assert.rejects(admin.query('SELECT cockpit.is_active_auth_session($1,$2)',[authId,userId]),{code:'42501'});
    await admin.query('RESET ROLE');
    console.log('PASS immutable profile UUID and linked assets across vehicle assignments; public access denied');
    await verifyReportingFlow(admin,a,b);
    await verifyReportCompletion(admin,connectionString);
    await verifyReportLedgerReplacement(admin,a,b);

  } finally { await a.end().catch(()=>{}); await b.end().catch(()=>{}); await admin.end(); }
}
main().catch(error=>{ console.error(error); process.exitCode=1; });
