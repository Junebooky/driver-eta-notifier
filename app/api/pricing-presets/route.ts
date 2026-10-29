import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { DEFAULT_VEHICLE_PRICING_PRESETS } from '@/utils/settlementCalculator';
import { verifyServerAuth, requireHqAdmin } from '@/lib/auth/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const isHqAdmin = auth.session.role === 'hq_admin';

    const { data, error } = await supabaseAdmin
      .from('pricing_presets')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.warn('[PricingPresets API] Supabase query error, fallback to defaults:', error.message);
      const sanitizedPresets = isHqAdmin
        ? DEFAULT_VEHICLE_PRICING_PRESETS
        : DEFAULT_VEHICLE_PRICING_PRESETS.map((p) => {
            const { driver_labor_korean, driver_labor_english, ...rest } = p as any;
            return rest;
          });
      return NextResponse.json({ ok: true, presets: sanitizedPresets, source: 'fallback' });
    }

    // Mask internal labor cost from non-HQ users (P0 Security)
    const sanitizedRows = (data || []).map((row: any) => {
      if (!isHqAdmin) {
        const { driver_labor_korean, driver_labor_english, ...rest } = row;
        return rest;
      }
      return row;
    });

    return NextResponse.json({ ok: true, presets: sanitizedRows, source: 'supabase' });
  } catch (err: any) {
    console.error('[PricingPresets API] Unexpected error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body = await req.json();
    const { id, model_name, base_fare, overtime_rate_per_hour, vehicle_only_fare, driver_labor_korean, driver_labor_english } = body;

    if (!id && !model_name) {
      return NextResponse.json({ ok: false, error: 'id 또는 model_name이 필요합니다.' }, { status: 400 });
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (base_fare !== undefined) updates.base_fare = Number(base_fare);
    if (overtime_rate_per_hour !== undefined) updates.overtime_rate_per_hour = Number(overtime_rate_per_hour);
    if (vehicle_only_fare !== undefined) updates.vehicle_only_fare = Number(vehicle_only_fare);
    if (driver_labor_korean !== undefined) updates.driver_labor_korean = Number(driver_labor_korean);
    if (driver_labor_english !== undefined) updates.driver_labor_english = Number(driver_labor_english);

    const query = id
      ? supabaseAdmin.from('pricing_presets').update(updates).eq('id', id)
      : supabaseAdmin.from('pricing_presets').update(updates).eq('model_name', model_name);

    const { data, error } = await query.select();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, preset: data?.[0] || updates });
  } catch (err: any) {
    console.error('[PricingPresets API PUT] Error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
