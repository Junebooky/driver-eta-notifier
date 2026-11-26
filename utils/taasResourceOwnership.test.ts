import test from 'node:test';
import assert from 'node:assert/strict';
import { checkTenantDispatchReferences, ownsActiveDriver, readOwnedResource, validateScopedFleetRows, scopeColumn, type ScopedResourceReader, type ResourceKind } from '../lib/taas/resourceOwnership';
import type { TenantIdentity } from '../lib/auth/tenantIdentity';
const a='vip_limousine_korea',b='chauffeur_service';
const id='a0000000-0000-4000-8000-000000000001',other='a0000000-0000-4000-8000-000000000002';
const identity:TenantIdentity={orgId:a,userId:id,hostname:'vip.example.test',role:'company_admin',driverId:null,sessionId:id,issuedAt:1,expiresAt:2,home:'/hq?tab=dashboard'};
const row=(kind:ResourceKind,org:string,key:string)=>({id:key,[scopeColumn(kind)]:org,driver_meta:{status:'active'},archived:false,status:'available',plate:'fixture plate',model:'fixture model'});
const read:ScopedResourceReader=async(kind,org,key)=>key===other?row(kind,b,key):row(kind,org,key);
test('dispatch references require exact company and immutable identity, including textual CRM ID',async()=>{
 assert.equal(await checkTenantDispatchReferences(identity,{driverId:id,vehicleId:id,customerId:'customer-001',scheduleId:id},read),true);
 for(const refs of [{driverId:other},{vehicleId:other},{scheduleId:other},{customerId:other}]) assert.equal(await checkTenantDispatchReferences(identity,refs,read),false);
 assert.equal(await checkTenantDispatchReferences({...identity,role:'driver'},{vehicleId:id},read),false);
 assert.equal(await readOwnedResource(read,'driver',a,'same driver name'),null);
 assert.equal(await readOwnedResource(async()=>({id,org_id:null}),'driver',a,id),null);
 assert.equal(await readOwnedResource(async()=>({id:other,org_id:a}),'driver',a,id),null);
 assert.equal(await ownsActiveDriver(async()=>({id,org_id:a,driver_meta:{status:'inactive'}}),a,id),false);
 assert.equal(await ownsActiveDriver(async()=>({id,org_id:a,driver_meta:{}}),a,id),false);
 assert.equal(await checkTenantDispatchReferences(identity,{vehicleId:id},async()=>({...row('vehicle',a,id),archived:true})),false);
 assert.equal(await checkTenantDispatchReferences(identity,{vehicleId:id},async()=>{throw Error('fixture');}),false);
});
test('DB fleet does not inject VIP cars or hide cross-company and archived data',()=>{
 assert.deepEqual(validateScopedFleetRows(b,[]),[]);
 assert.deepEqual(validateScopedFleetRows(b,[row('vehicle',b,id)]),[row('vehicle',b,id)]);
 for(const rows of [[row('vehicle',a,id)],[{...row('vehicle',b,id),archived:true}],[row('vehicle',b,id),row('vehicle',b,id)],null]) assert.throws(()=>validateScopedFleetRows(b,rows));
});
