import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { LocationPreset } from '@/types';
import { DEFAULT_PRESET_LOCATIONS } from '@/utils/presets';

export async function GET(req: NextRequest) {
  try {
    // Query common master presets (cockpit_presets SSOT)
    const { data: rawPresets, error: presetsError } = await supabaseAdmin
      .from('presets')
      .select('*')
      .order('order_index', { ascending: true });

    if (presetsError || !rawPresets || rawPresets.length === 0) {
      // If table doesn't exist yet or is empty, gracefully return default presets
      return NextResponse.json({
        presets: DEFAULT_PRESET_LOCATIONS,
        fallback: true,
      });
    }

    const presets: LocationPreset[] = rawPresets.map((row: any) => ({
      id: row.id,
      name: row.name,
      shortName: row.short_name || row.name,
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      category: (row.category ? row.category.toUpperCase() : 'CUSTOM') as any,
      address: row.address,
      isGlobal: true,
    }));

    return NextResponse.json({ presets, fallback: false });
  } catch (err: any) {
    console.error('Error fetching presets from Supabase:', err);
    return NextResponse.json({ presets: DEFAULT_PRESET_LOCATIONS, fallback: true, error: err?.message });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, shortName, address, lat, lng, category, order_index = 0 } = body;

    if (!name || lat === undefined || lng === undefined) {
      return NextResponse.json({ error: 'Missing required preset fields' }, { status: 400 });
    }

    const payload: any = {
      name,
      address: address || '',
      lat: Number(lat),
      lng: Number(lng),
      category: (category || 'custom').toLowerCase(),
      order_index,
    };

    if (id && !id.startsWith('custom_') && !id.startsWith('home_')) {
      payload.id = id;
    }

    const { data, error } = await supabaseAdmin
      .from('presets')
      .upsert(payload, { onConflict: 'name' })
      .select()
      .single();

    if (error) {
      console.warn('Supabase preset upsert error:', error);
      return NextResponse.json({ error: error.message, fallback: true }, { status: 400 });
    }

    const savedPreset: LocationPreset = {
      id: data.id,
      name: data.name,
      shortName: data.name,
      address: data.address,
      lat: parseFloat(data.lat),
      lng: parseFloat(data.lng),
      category: (data.category ? data.category.toUpperCase() : 'CUSTOM') as any,
      isGlobal: true,
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
      .from('presets')
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
