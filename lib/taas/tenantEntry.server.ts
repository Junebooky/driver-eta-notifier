import {tenantBrandCandidate} from './tenantBranding.server';
import {verifyTenantAuthCandidate} from '../auth/tenantAuthCandidate.server';
import {resolveTenantEntry} from './tenantEntry';
import {tenantFeatureCandidate} from './tenantFeatures.server';

/** Candidate only: both underlying adapters are hard locked. No legacy
 * fallback and no active layout / API mount until ingress and all P0 gates pass. */
export const tenantEntryCandidate=(trustedHost:string,token:string|null)=>resolveTenantEntry(trustedHost,token,{
 brand:tenantBrandCandidate,verify:verifyTenantAuthCandidate,features:tenantFeatureCandidate,
});
