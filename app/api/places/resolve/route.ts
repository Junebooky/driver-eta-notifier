import { NextRequest, NextResponse } from 'next/server';
import { resolvePlaceQuery } from '@/services/placeResolutionService';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query');
    const orgId = searchParams.get('org_id') || undefined;

    if (!query) {
      return NextResponse.json({ error: 'query parameter is required' }, { status: 400 });
    }

    const result = await resolvePlaceQuery(query, orgId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
