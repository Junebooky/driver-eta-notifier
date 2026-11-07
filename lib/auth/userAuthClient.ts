import { createClient } from '@supabase/supabase-js';

/** Never sign a user into the shared service-role client. Each request gets its own client. */
export function createUserAuthClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('개인 계정 인증 서비스가 설정되지 않았습니다.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
