import type {TenantIdentity} from '../auth/tenantIdentity';
import {hasLegacyExcelAccess} from '../driverReports/legacyExcelPolicy';

export interface TenantFeaturePolicy {legacyReportExcel:boolean}
/** Only matching, fresh server response can enable an optional feature.
 * Standard functions are not toggled here. The UI policy is not API authorization. */
export function parseTenantFeaturePolicy(identity:TenantIdentity,raw:unknown):TenantFeaturePolicy|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const r=raw as Record<string,unknown>;
 if(r.orgId!==identity.orgId||r.userId!==identity.userId||r.sessionId!==identity.sessionId||r.role!==identity.role||r.driverId!==identity.driverId||typeof r.legacyReportExcel!=='boolean')return null;
 return {legacyReportExcel:hasLegacyExcelAccess(identity.orgId)&&r.legacyReportExcel};
}
export function legacyExcelVisible(presentation:{legacyReportExcel?:boolean}|null):boolean{
 // Null denotes existing legacy app, NOT a missing/failed tenant lookup.
 return presentation===null||presentation.legacyReportExcel===true;
}
export function resolveTenantHqTab(tab:string|null|undefined,presentation:{legacyReportExcel?:boolean}|null):string{
 if(!tab||tab==='dashboard'||(tab==='excel_import'&&!legacyExcelVisible(presentation)))return 'dispatch';
 return tab;
}
