import { verifyServerAuth } from '@/lib/auth/serverAuth';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { DEFAULT_VERIFIED_PLACES } from '@/services/placeResolutionService';

export async function GET(req: NextRequest) {
  const apiAuth = await verifyServerAuth(req);
  if (!apiAuth.ok) return NextResponse.json({ ok: false, error: apiAuth.error }, { status: apiAuth.statusCode });
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('org_id');

    let query = supabaseAdmin.from('org_places').select('*');
    if (orgId) {
      query = query.eq('org_id', orgId);
    }

    const { data, error } = await query.order('name', { ascending: true });

    if (error) {
      console.warn('[Places API] Notice querying org_places from Supabase:', error.message);
      return NextResponse.json({ places: DEFAULT_VERIFIED_PLACES, fallback: true });
    }

    const combined = [...(data || []), ...DEFAULT_VERIFIED_PLACES];
    // Deduplicate by name
    const seen = new Set<string>();
    const unique = combined.filter((p) => {
      if (seen.has(p.name)) return false;
      seen.add(p.name);
      return true;
    });

    return NextResponse.json({ places: unique, fallback: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ places: DEFAULT_VERIFIED_PLACES, fallback: true, error: message });
  }
}
