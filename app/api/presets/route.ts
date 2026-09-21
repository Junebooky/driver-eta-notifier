import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { LocationPreset } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const driverId = searchParams.get('driverId') || 'driver_4';

    // Query presets: global presets + this driver's custom presets
    const { data: rawPresets, error: presetsError } = await supabaseAdmin
      .from('cockpit_presets')
      .select('*')
      .or(`is_global.eq.true,driver_id.eq.${driverId}`);

    if (presetsError) {
      // If table doesn't exist yet in Supabase (PGRST205), gracefully indicate fallback
      return NextResponse.json({
        presets: [],
        fallback: true,
        message: presetsError.message,
      });
    }

    // Query driver for custom preset_order
    const { data: driverData } = await supabaseAdmin
      .from('cockpit_drivers')
      .select('preset_order')
      .eq('id', driverId)
      .single();

    const orderArray: string[] = driverData?.preset_order || [];

    const presets: LocationPreset[] = (rawPresets || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      shortName: row.short_name || row.name,
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      category: row.category || (row.is_global ? 'HOTEL' : 'CUSTOM'),
      address: row.address,
      isGlobal: !!row.is_global,
      driverId: row.driver_id,
    }));

    // If orderArray exists, sort according to driver's saved preset_order
    if (orderArray.length > 0) {
      const orderMap = new Map<string, number>();
      orderArray.forEach((id, idx) => orderMap.set(id, idx));

      presets.sort((a, b) => {
        const orderA = orderMap.has(a.id) ? orderMap.get(a.id)! : 999;
        const orderB = orderMap.has(b.id) ? orderMap.get(b.id)! : 999;
        return orderA - orderB;
      });
    }

    return NextResponse.json({ presets, fallback: false });
  } catch (err: any) {
    console.error('Error fetching presets from Supabase:', err);
    return NextResponse.json({ presets: [], fallback: true, error: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, shortName, address, lat, lng, category, isGlobal, driverId } = body;

    if (!name || lat === undefined || lng === undefined) {
      return NextResponse.json({ error: 'Missing required preset fields' }, { status: 400 });
    }

    const payload: any = {
      name,
      short_name: shortName || name,
      address: address || '',
      lat: Number(lat),
      lng: Number(lng),
      category: category || (isGlobal ? 'HOTEL' : 'CUSTOM'),
      is_global: !!isGlobal,
      driver_id: isGlobal ? null : (driverId || 'driver_4'),
    };

    if (id && !id.startsWith('custom_') && !id.startsWith('home_')) {
      payload.id = id;
    }

    const { data, error } = await supabaseAdmin
      .from('cockpit_presets')
      .upsert(payload)
      .select()
      .single();

    if (error) {
      console.warn('Supabase preset upsert error:', error);
      return NextResponse.json({ error: error.message, fallback: true }, { status: 400 });
    }

    const savedPreset: LocationPreset = {
      id: data.id,
      name: data.name,
      shortName: data.short_name,
      address: data.address,
      lat: parseFloat(data.lat),
      lng: parseFloat(data.lng),
      category: data.category,
      isGlobal: data.is_global,
      driverId: data.driver_id,
    };

    return NextResponse.json({ preset: savedPreset });
  } catch (err: any) {
    console.error('Error creating preset in Supabase:', err);
    return NextResponse.json({ error: err?.message, fallback: true }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Preset ID is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('cockpit_presets')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
