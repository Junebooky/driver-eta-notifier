import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { LocationPreset } from '@/types';
import { DEFAULT_PRESET_LOCATIONS } from '@/utils/presets';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawVehicleNo = searchParams.get('vehicle_no');
    const vehicleNo = rawVehicleNo?.match(/(\d+호차)/)?.[1] || (rawVehicleNo && rawVehicleNo !== 'all' ? rawVehicleNo.trim() : null);

    let query = supabaseAdmin.from('presets').select('*');

    // Strict Rule: If vehicleNo is provided, query common master presets (vehicle_no IS NULL) OR vehicle's own custom presets
    if (vehicleNo) {
      query = query.or(`vehicle_no.is.null,vehicle_no.eq.${vehicleNo}`);
    }

    const { data: rawPresets, error: presetsError } = await query;

    if (presetsError || !rawPresets || rawPresets.length === 0) {
      // If table doesn't exist yet or is empty, gracefully return default presets
      return NextResponse.json({
        presets: DEFAULT_PRESET_LOCATIONS,
        fallback: true,
      });
    }

    // Strict Rule: Common presets (vehicle_no IS NULL) on top, then custom presets by order_index / name
    const sorted = [...rawPresets].sort((a: any, b: any) => {
      const aIsCommon = !a.vehicle_no;
      const bIsCommon = !b.vehicle_no;
      if (aIsCommon && !bIsCommon) return -1;
      if (!aIsCommon && bIsCommon) return 1;
      return (a.order_index ?? 0) - (b.order_index ?? 0);
    });

    const presets: LocationPreset[] = sorted.map((row: any) => ({
      id: row.id,
      name: row.name,
      shortName: row.short_name || row.name,
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      category: (row.category ? row.category.toUpperCase() : 'CUSTOM') as any,
      address: row.address,
      isGlobal: row.vehicle_no ? false : true,
      vehicle_no: row.vehicle_no || null,
      vehicleNo: row.vehicle_no || null,
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
    const { id, name, shortName, address, lat, lng, category, order_index = 0, vehicle_no, vehicleNo } = body;

    if (!name || lat === undefined || lng === undefined) {
      return NextResponse.json({ error: 'Missing required preset fields' }, { status: 400 });
    }

    const targetVehicle = vehicle_no || vehicleNo;
    const cleanVehicleNo = targetVehicle ? (targetVehicle.match(/(\d+호차)/)?.[1] || targetVehicle.trim()) : null;

    const payload: any = {
      name,
      address: address || '',
      lat: Number(lat),
      lng: Number(lng),
      category: (category || 'custom').toLowerCase(),
      order_index,
      vehicle_no: cleanVehicleNo, // Strict Rule: Bind vehicle_no to avoid polluting common master presets
    };

    if (id && !id.startsWith('custom_') && !id.startsWith('home_') && !id.startsWith('preset-')) {
      payload.id = id;
    }

    let resultData: any;

    if (payload.id) {
      // Upsert by ID
      const { data, error } = await supabaseAdmin
        .from('presets')
        .upsert(payload, { onConflict: 'id' })
        .select()
        .single();
      if (error) throw error;
      resultData = data;
    } else {
      // Check if preset with same name exists for this vehicle
      let checkQuery = supabaseAdmin.from('presets').select('id').eq('name', name);
      if (cleanVehicleNo) {
        checkQuery = checkQuery.eq('vehicle_no', cleanVehicleNo);
      } else {
        checkQuery = checkQuery.is('vehicle_no', null);
      }
      const { data: existing } = await checkQuery.maybeSingle();

      if (existing?.id) {
        payload.id = existing.id;
        const { data, error } = await supabaseAdmin
          .from('presets')
          .update(payload)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        resultData = data;
      } else {
        const { data, error } = await supabaseAdmin
          .from('presets')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        resultData = data;
      }
    }

    const savedPreset: LocationPreset = {
      id: resultData.id,
      name: resultData.name,
      shortName: resultData.name,
      address: resultData.address,
      lat: parseFloat(resultData.lat),
      lng: parseFloat(resultData.lng),
      category: (resultData.category ? resultData.category.toUpperCase() : 'CUSTOM') as any,
      isGlobal: resultData.vehicle_no ? false : true,
      vehicle_no: resultData.vehicle_no || null,
      vehicleNo: resultData.vehicle_no || null,
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
    const rawVehicleNo = searchParams.get('vehicle_no');
    const vehicleNo = rawVehicleNo?.match(/(\d+호차)/)?.[1] || (rawVehicleNo ? rawVehicleNo.trim() : null);

    if (!id) {
      return NextResponse.json({ error: 'Preset ID is required' }, { status: 400 });
    }

    // 1. Fetch target preset to check ownership
    const { data: targetPreset, error: fetchError } = await supabaseAdmin
      .from('presets')
      .select('id, name, vehicle_no')
      .eq('id', id)
      .single();

    if (fetchError || !targetPreset) {
      return NextResponse.json({ error: '삭제할 거점을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 2. Strict Rule: vehicle_no IS NULL indicates Common Master Preset (deletion strictly forbidden)
    if (!targetPreset.vehicle_no) {
      return NextResponse.json(
        { error: '공통 마스터 거점(인천공항, 호텔, 서킷 등)은 삭제할 수 없습니다.' },
        { status: 403 }
      );
    }

    // 3. Strict Rule: Only allow deletion if vehicle_no matches current vehicle
    if (vehicleNo && targetPreset.vehicle_no !== vehicleNo) {
      return NextResponse.json(
        { error: '타 호차의 전용 거점은 삭제할 수 없습니다.' },
        { status: 403 }
      );
    }

    // 4. Delete the custom preset
    const { error: deleteError } = await supabaseAdmin
      .from('presets')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    console.error('Error deleting preset:', err);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
