import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rvaowhriekibxtcpyalu.supabase.co';
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder';

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY is not defined in server environment');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  db: {
    schema: 'cockpit',
  },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
