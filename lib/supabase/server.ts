import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://supabase.invalid';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'unconfigured-server-key';
const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const client = createClient(supabaseUrl, supabaseServiceRoleKey, {
  db: {
    schema: 'cockpit',
    retry: process.env.NODE_ENV !== 'test',
  },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const supabaseAdmin = new Proxy(client, {
  get(target, property, receiver) {
    if (!configured && process.env.NODE_ENV !== 'test') throw new Error('서버 DB 환경변수가 구성되지 않았습니다.');
    return Reflect.get(target, property, receiver);
  },
});
