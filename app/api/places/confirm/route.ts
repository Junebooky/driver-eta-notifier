import { NextRequest, NextResponse } from 'next/server';
import { saveConfirmedPlace } from '@/services/placeResolutionService';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { name, aliases, road_address, lat, lng, entry_gate_notes, org_id, verified_by } = body;

    if (!name || !road_address || typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json(
        { error: 'name, road_address, lat, and lng are required to confirm a place' },
        { status: 400 }
      );
    }

    const result = await saveConfirmedPlace({
      name,
      aliases: Array.isArray(aliases) ? aliases : [name],
      road_address,
      lat,
      lng,
      entry_gate_notes,
      org_id,
      verified_by: verified_by || 'HQ_MANAGER',
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Failed to save place' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, place: result.place });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
