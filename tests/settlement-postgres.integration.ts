import {Client} from 'pg';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

async function main(){
  const connectionString=process.env.TEST_DATABASE_URL;
  if(!connectionString || !['localhost','127.0.0.1'].includes(new URL(connectionString).hostname))
    throw new Error('settlement integration test requires disposable local Postgres');
  const db=new Client({connectionString});await db.connect();
  try{
    await db.query([
      'DO $$ BEGIN',
      " IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;",
      " IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;",
      " IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;",
      'END $$;',
      'CREATE SCHEMA cockpit;',
      'GRANT USAGE ON SCHEMA cockpit TO service_role;',
      'CREATE TABLE cockpit.schedules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id text, customer_name text);',
      'CREATE TABLE cockpit.driving_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid,',
      ' organization_id text, status text, customer_service_start time, customer_service_end time);',
      'CREATE TABLE cockpit.expenses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid,',
      ' organization_id text, status text, amount integer);',
    ].join('\n'));
    const migration=readFileSync('supabase/migrations/20261108163000_server_settlement_ledger.sql','utf8');
    await db.query(migration);await db.query(migration);
    const permissions=await db.query("SELECT has_table_privilege('anon','cockpit.settlement_documents','SELECT') AS anon_read, has_table_privilege('authenticated','cockpit.settlement_documents','INSERT') AS user_write, has_function_privilege('anon','cockpit.commit_settlement_document(text,uuid,text,text,integer,text,jsonb,jsonb,jsonb)','EXECUTE') AS anon_commit");
    assert.equal(permissions.rows[0].anon_read,false);
    assert.equal(permissions.rows[0].user_write,false);
    assert.equal(permissions.rows[0].anon_commit,false);
    const schedule='9b54d8be-6033-4e11-a985-6a653c1bd782';
    const org='vip_limousine_korea';
    const actor='14f24193-267f-4fe5-9635-392f644cfa04';
    await db.query('INSERT INTO cockpit.schedules(id,org_id,customer_name) VALUES($1,$2,$3)',[schedule,org,'Real Customer']);
    await db.query("INSERT INTO cockpit.driving_logs(booking_id,organization_id,status,customer_service_start,customer_service_end) VALUES($1,$2,'승인 완료','09:00','21:50')",[schedule,org]);
    await db.query("INSERT INTO cockpit.expenses(booking_id,organization_id,status,amount) VALUES($1,$2,'승인 완료',18000)",[schedule,org]);
    const getHash=async()=> (await db.query('SELECT cockpit.settlement_live_source_hash($1,$2) AS hash',[schedule,org])).rows[0].hash as string;
    const commit=async(action:string,version:number,hash:string,source?:unknown,contract?:unknown,totals?:unknown)=>{
      const result=await db.query(
        'SELECT * FROM cockpit.commit_settlement_document($1::text,$2::uuid,$3::text,$4::text,$5::integer,$6::text,$7::jsonb,$8::jsonb,$9::jsonb)',
        [org,schedule,actor,action,version,hash,source?JSON.stringify(source):null,contract?JSON.stringify(contract):null,totals?JSON.stringify(totals):null]
      );
      return result.rows[0] as {id:string;version:number;status:string;source_hash:string};
    };
    const hash=await getHash();
    const source={serviceVerified:true,approvedLogCount:1,pendingExpenseCount:0};
    const contract={reference:'CONTRACT-123456',laborReference:'LABOR-123456',baseRate:800000};
    const totals={supplyAmount:998000,grandTotal:1097800};
    const prepared=await commit('prepare',0,hash,source);
    assert.equal(prepared.version,1);assert.equal(prepared.status,'draft');
    await assert.rejects(commit('price',0,hash,undefined,contract,totals),/SETTLEMENT_VERSION_CONFLICT/);
    const priced=await commit('price',1,hash,undefined,contract,totals);
    assert.equal(priced.status,'reviewing');assert.equal(priced.version,2);
    const approved=await commit('approve',2,hash);
    assert.equal(approved.status,'approved');assert.equal(approved.version,3);
    await assert.rejects(commit('price',3,hash,undefined,contract,totals),/SETTLEMENT_LOCKED/);
    await db.query('UPDATE cockpit.schedules SET customer_name=$1 WHERE id=$2',['Changed Customer',schedule]);
    await assert.rejects(commit('issue',3,hash),/SOURCE_CHANGED/);
    await db.query('UPDATE cockpit.schedules SET customer_name=$1 WHERE id=$2',['Real Customer',schedule]);
    assert.equal(await getHash(),hash);
    const issued=await commit('issue',3,hash);
    assert.equal(issued.status,'issued');assert.equal(issued.version,4);
    await assert.rejects(commit('prepare',4,hash,source),/SETTLEMENT_LOCKED/);
    const audit=await db.query('SELECT version,action,actor_id FROM cockpit.settlement_document_audit WHERE document_id=$1 ORDER BY version',[issued.id]);
    assert.deepEqual(audit.rows.map(r=>r.action),['prepare','price','approve','issue']);
    assert.deepEqual(audit.rows.map(r=>r.version),[1,2,3,4]);
    assert.ok(audit.rows.every(r=>r.actor_id===actor));
    process.stdout.write('Settlement migration, RLS, CAS, stale source, approvals and audit passed\n');
  }finally{await db.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
