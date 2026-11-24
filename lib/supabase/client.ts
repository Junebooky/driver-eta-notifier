import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://supabase.invalid';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'unconfigured-public-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'cockpit',
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
