import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// This test wipes ONLY its disposable localhost database schema.
async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
    throw new Error('Admin delete integration test requires disposable localhost Postgres');
  }
  const db = new Client({ connectionString: url });
  await db.connect();
  const org = 'vip_limousine_korea';
  const actor = 'hq-test-admin';
  const newId = () => randomUUID();
  try {
    await db.query(`DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
    END $$;
    DROP SCHEMA IF EXISTS cockpit CASCADE;
    CREATE SCHEMA cockpit;
    GRANT USAGE ON SCHEMA cockpit TO anon, authenticated, service_role;
    CREATE TABLE cockpit.schedules (
      id uuid PRIMARY KEY, org_id text DEFAULT 'vip_limousine_korea',
      status text DEFAULT 'scheduled',
      dispatch_status text NOT NULL DEFAULT 'published',
      updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE cockpit.driving_logs (
      id uuid PRIMARY KEY, organization_id text NOT NULL,
      booking_id uuid REFERENCES cockpit.schedules(id) ON DELETE SET NULL,
      status text NOT NULL, submitted_at timestamptz, reviewed_at timestamptz
    );
    CREATE TABLE cockpit.expenses (
      id uuid PRIMARY KEY, organization_id text NOT NULL,
      booking_id uuid REFERENCES cockpit.schedules(id) ON DELETE SET NULL,
      driving_log_id uuid REFERENCES cockpit.driving_logs(id) ON DELETE SET NULL,
      status text NOT NULL, submitted_at timestamptz, reviewed_at timestamptz,
      receipt_storage_path text, has_receipt_image boolean DEFAULT false
    );
    CREATE TABLE cockpit.settlement_documents (
      id uuid PRIMARY KEY, organization_id text NOT NULL,
      schedule_id uuid NOT NULL REFERENCES cockpit.schedules(id) ON DELETE RESTRICT,
      status text NOT NULL DEFAULT 'draft'
    );
    CREATE TABLE cockpit.driving_log_booking_link_audit (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, organization_id text NOT NULL,
      driving_log_id uuid REFERENCES cockpit.driving_logs(id), booking_id uuid REFERENCES cockpit.schedules(id)
    );
    CREATE TABLE cockpit.vehicle_custodies (
      id uuid PRIMARY KEY, organization_id text NOT NULL,
      booking_id uuid REFERENCES cockpit.schedules(id)
    );
    CREATE TABLE cockpit.vehicle_custody_requests (
      id uuid PRIMARY KEY, organization_id text NOT NULL,
      booking_id uuid REFERENCES cockpit.schedules(id)
    );
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA cockpit TO service_role;`);
    const migration = readFileSync('supabase/migrations/20261110090000_hq_admin_schedule_deletion.sql','utf8');
    await db.query(migration);
    await db.query(migration); // idempotent migration

    const schedule = async () => {
      const id = newId();
      await db.query('INSERT INTO cockpit.schedules (id,org_id) VALUES($1,$2)',[id,org]);
      return id;
    };
    const log = async (id: string, status = 'draft') => {
      const logId = newId();
      await db.query('INSERT INTO cockpit.driving_logs (id,organization_id,booking_id,status,submitted_at) VALUES($1,$2,$3,$4,$5)',
        [logId,org,id,status,status==='draft'?null:new Date()]);
      return logId;
    };
    const expense = async (id: string, logId: string | null = null, status = 'draft') => {
      const expenseId = newId();
      await db.query('INSERT INTO cockpit.expenses (id,organization_id,booking_id,driving_log_id,status) VALUES($1,$2,$3,$4,$5)',
        [expenseId,org,id,logId,status]);
      return expenseId;
    };
    const call = async (ids: string[], mode: string) =>
      (await db.query('SELECT cockpit.admin_schedule_delete($1::uuid[],$2,$3) result',[ids,mode,actor])).rows[0].result;
    const saved = async (id: string) =>
      (await db.query('SELECT status,dispatch_status FROM cockpit.schedules WHERE id=$1',[id])).rows[0];
    const count = async (name: string, id: string, foreign = 'booking_id') =>
      Number((await db.query(`SELECT count(*) FROM cockpit.${name} WHERE ${foreign}=$1`,[id])).rows[0].count);

    // No linked operational work: actual SQL DELETE, not hidden tombstone.
    const plain = await schedule();
    assert.equal((await call([plain],'inspect')).hasRecords,false);
    const plainDeleted = await call([plain],'schedule_only');
    assert.equal(plainDeleted.appliedMode,'hard_deleted');
    assert.equal(await saved(plain),undefined);
    console.log('PASS clean booking is physically deleted');
    // Legacy imported bookings may have NULL status; they are still deletable.
    const legacy = await schedule();
    await db.query('UPDATE cockpit.schedules SET status=NULL WHERE id=$1',[legacy]);
    assert.equal((await call([legacy],'schedule_only')).appliedMode,'hard_deleted');
    assert.equal(await saved(legacy),undefined);
    console.log('PASS legacy null-status booking can be deleted');

    // Linked drafts default to retaining those drafts and hiding only booking.
    const retain = await schedule();
    const retainedLog = await log(retain);
    await expense(retain,retainedLog);
    const checkRetain = await call([retain],'inspect');
    assert.equal(checkRetain.hasRecords,true);
    assert.equal(checkRetain.canIncludeDrafts,true);
    assert.equal(checkRetain.counts.drivingLogs,1);
    assert.equal(checkRetain.counts.expenses,1);
    assert.equal((await call([retain],'schedule_only')).appliedMode,'archived_booking');
    assert.deepEqual(await saved(retain), {status:'deleted',dispatch_status:'cancelled'});
    assert.equal(await count('driving_logs',retain),1);
    assert.equal(await count('expenses',retain),1);
    console.log('PASS linked drafts preserved with removed active schedule');

    // Explicit full deletion is allowed ONLY for unsubmitted drafts.
    const drafts = await schedule();
    const draftLog = await log(drafts);
    await expense(drafts,draftLog);
    assert.equal((await call([drafts],'include_drafts')).appliedMode,'hard_deleted');
    assert.equal(await saved(drafts),undefined);
    assert.equal(await count('driving_logs',drafts),0);
    assert.equal(await count('expenses',drafts),0);
    console.log('PASS selected unsubmitted drafts removed atomically');

    // Submitted/reviewed work is NEVER removed; the alternative remains archive.
    const submitted = await schedule();
    await log(submitted,'검토 대기');
    assert.equal((await call([submitted],'inspect')).canIncludeDrafts,false);
    await assert.rejects(call([submitted],'include_drafts'), /RECORDS_REQUIRE_RETENTION/);
    assert.deepEqual(await saved(submitted),{status:'scheduled',dispatch_status:'published'});
    assert.equal((await call([submitted],'schedule_only')).appliedMode,'archived_booking');
    assert.equal(await count('driving_logs',submitted),1);
    console.log('PASS finalized work cannot be deleted');

    // A settlement, even a draft, and custody history keep their FK references.
    const settled = await schedule();
    await db.query('INSERT INTO cockpit.settlement_documents VALUES ($1,$2,$3,$4)',[newId(),org,settled,'draft']);
    assert.equal((await call([settled],'inspect')).canIncludeDrafts,false);
    await assert.rejects(call([settled],'include_drafts'),/RECORDS_REQUIRE_RETENTION/);
    await call([settled],'schedule_only');
    assert.equal(await count('settlement_documents',settled,'schedule_id'),1);

    const held = await schedule();
    await db.query('INSERT INTO cockpit.vehicle_custodies VALUES ($1,$2,$3)',[newId(),org,held]);
    assert.equal((await call([held],'inspect')).canIncludeDrafts,false);
    await call([held],'schedule_only');
    assert.equal(await count('vehicle_custodies',held),1);
    console.log('PASS settlement and vehicle handover preserved');

    // Multi-ID batch: one protected record means zero drafts are lost.
    const multiDraft = await schedule();
    const multiDraftLog = await log(multiDraft);
    await expense(multiDraft,multiDraftLog);
    const multiFinal = await schedule();
    await log(multiFinal,'승인 완료');
    await assert.rejects(call([multiDraft,multiFinal],'include_drafts'),/RECORDS_REQUIRE_RETENTION/);
    assert.deepEqual(await saved(multiDraft),{status:'scheduled',dispatch_status:'published'});
    assert.equal(await count('driving_logs',multiDraft),1);
    assert.equal(await count('expenses',multiDraft),1);
    console.log('PASS multi-booking deletion is all-or-nothing');

    const audit = await db.query('SELECT applied_mode,requested_mode,actor_id FROM cockpit.schedule_deletion_audit ORDER BY created_at');
    assert.ok(audit.rows.some((x: any) => x.applied_mode==='hard_deleted' && x.requested_mode==='include_drafts'));
    assert.ok(audit.rows.every((x: any) => x.actor_id===actor));

    await db.query('SET ROLE authenticated');
    await assert.rejects(call([multiDraft],'schedule_only'), /permission denied/);
    await db.query('RESET ROLE');
    console.log('PASS delete audit and non-admin SQL permission boundary');
  } finally {
    await db.query('RESET ROLE').catch(()=>{});
    await db.end();
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
