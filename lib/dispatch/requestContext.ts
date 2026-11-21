import { createHash } from 'node:crypto';
import type { CockpitAuthSession } from '@/lib/auth/serverAuth';
import { canonicalJson } from '@/utils/retryableJsonMutation';

export function dispatchRequestContext(request:Request,session:CockpitAuthSession,body:unknown) {
  const key=request.headers.get('idempotency-key');
  if(!key || !/^[a-zA-Z0-9_-]{8,160}$/.test(key)) return null;
  // A client key is never shared between two authenticated operators or API operations.
  const operation=`${request.method}:${new URL(request.url).pathname}`;
  const scoped=createHash('sha256').update(canonicalJson([session.org,session.userId,operation,key])).digest('hex');
  return {requestId:scoped,fingerprint:createHash('sha256').update(canonicalJson(body)).digest('hex')};
}
