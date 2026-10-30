// Unit tests never reach a live service, even when the shell has production secrets.
process.env.NODE_ENV = 'test';
process.env.DEV_AUTH_ENABLED = 'false';
process.env.COCKPIT_AUTH_SECRET = 'isolated-test-signing-secret-not-for-deployment';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'isolated-test-key';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
for (const name of ['VERCEL','VERCEL_ENV','GEMINI_API_KEY','TMAP_API_KEY','KAKAO_REST_API_KEY']) delete process.env[name];
globalThis.fetch = async () => { throw new Error('Unit test network disabled: inject a fixture'); };
