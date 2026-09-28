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
      name: row.name || row.display_name || row.full_name,
      shortName: row.name || row.short_name || row.display_name || row.full_name,
      fullName: row.full_name || row.name,
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      category: (row.category ? row.category.toUpperCase() : 'CUSTOM') as any,
      address: row.address,
      isGlobal: row.vehicle_no ? false : true,
      isCommon: row.vehicle_no ? false : true,
      type: (row.vehicle_no ? 'personal' : 'common') as 'common' | 'personal',
      vehicle_no: row.vehicle_no || null,
      vehicleNo: row.vehicle_no || null,
      order: row.order_index ?? 0,
    }));

    return NextResponse.json({ presets, fallback: false });
  } catch (err: any) {
    console.error('Error fetching presets from Supabase:', err);
    return NextResponse.json({ presets: DEFAULT_PRESET_LOCATIONS, fallback: true, error: err?.message });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, name, shortName, fullName, address, lat, lng, type, isCommon, isGlobal, vehicle_no, vehicleNo, order, order_index, category } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing preset id' }, { status: 400 });
    }

    const isPresetCommon = Boolean(isCommon || type === 'common' || isGlobal || (!vehicle_no && !vehicleNo));
    const targetVehicle = isPresetCommon ? null : (vehicle_no || vehicleNo);
    const cleanVehicleNo = targetVehicle ? (targetVehicle.match(/(\d+호차)/)?.[1] || targetVehicle.trim()) : null;

    // Display Name ('SGBAC') vs Full Name ('서울김포비즈니스항공센터')
    const displayName = (name || shortName || fullName || '').trim();
    const fullPlaceName = (fullName || name || displayName).trim();

    // DB 업데이트 페이로드 구성 (name 표시이름 보존, full_name 풀네임 보존)
    const updatePayload: Record<string, any> = {
      name: displayName,
      full_name: fullPlaceName,
      address: address || '',
      lat: Number(lat),
      lng: Number(lng),
      vehicle_no: isPresetCommon ? null : cleanVehicleNo,
      updated_at: new Date().toISOString(),
    };

    if (category) {
      updatePayload.category = category.toLowerCase();
    }
    if (typeof order === 'number') {
      updatePayload.order_index = order;
    } else if (typeof order_index === 'number') {
      updatePayload.order_index = order_index;
    }

    const { data, error } = await supabaseAdmin
      .from('presets')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update preset in DB:', error);
      // DB 업데이트 실패 시에도 프론트엔드가 중단되지 않도록 적절한 응답 반환
      return NextResponse.json({
        ...body,
        ...updatePayload,
        preset: {
          ...body,
          ...updatePayload,
          shortName: displayName,
          fullName: fullPlaceName,
          type: isPresetCommon ? 'common' : 'personal',
          isCommon: isPresetCommon,
          isGlobal: isPresetCommon,
          vehicle_no: isPresetCommon ? null : cleanVehicleNo,
          vehicleNo: isPresetCommon ? null : cleanVehicleNo,
        },
      }, { status: 200 });
    }

    const savedPreset: LocationPreset = {
      id: data.id,
      name: data.name || displayName,
      shortName: data.name || displayName,
      fullName: data.full_name || fullPlaceName,
      address: data.address,
      lat: parseFloat(data.lat),
      lng: parseFloat(data.lng),
      category: (data.category ? data.category.toUpperCase() : 'CUSTOM') as any,
      isGlobal: isPresetCommon,
      isCommon: isPresetCommon,
      type: isPresetCommon ? 'common' : 'personal',
      vehicle_no: data.vehicle_no || null,
      vehicleNo: data.vehicle_no || null,
      order: data.order_index ?? 0,
    };

    return NextResponse.json({
      ...data,
      preset: savedPreset,
      name: savedPreset.name,
      shortName: savedPreset.shortName,
      fullName: savedPreset.fullName,
      full_name: savedPreset.fullName,
    }, { status: 200 });
  } catch (err: any) {
    console.error('PUT /api/presets error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, shortName, fullName, address, lat, lng, category, order, order_index = 0, vehicle_no, vehicleNo } = body;

    const displayName = (name || shortName || fullName || '').trim();
    const fullPlaceName = (fullName || name || displayName).trim();

    if (!displayName || lat === undefined || lng === undefined) {
      return NextResponse.json({ error: 'Missing required preset fields' }, { status: 400 });
    }

    const isCommon = Boolean(body.isCommon || body.type === 'common' || body.isGlobal);
    const targetVehicle = isCommon ? null : (vehicle_no || vehicleNo);
    const cleanVehicleNo = targetVehicle ? (targetVehicle.match(/(\d+호차)/)?.[1] || targetVehicle.trim()) : null;

    const payload: any = {
      name: displayName,
      full_name: fullPlaceName,
      address: address || '',
      lat: Number(lat),
      lng: Number(lng),
      category: (category || 'custom').toLowerCase(),
      order_index: typeof order === 'number' ? order : order_index,
      vehicle_no: cleanVehicleNo, // Strict Rule: Bind vehicle_no to avoid polluting common master presets
      updated_at: new Date().toISOString(),
    };

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (id && typeof id === 'string' && UUID_REGEX.test(id)) {
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
      let checkQuery = supabaseAdmin.from('presets').select('id').eq('name', displayName);
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
      name: resultData.name || displayName,
      shortName: resultData.name || displayName,
      fullName: resultData.full_name || fullPlaceName,
      address: resultData.address,
      lat: parseFloat(resultData.lat),
      lng: parseFloat(resultData.lng),
      category: (resultData.category ? resultData.category.toUpperCase() : 'CUSTOM') as any,
      isGlobal: resultData.vehicle_no ? false : true,
      isCommon: resultData.vehicle_no ? false : true,
      type: resultData.vehicle_no ? 'personal' : 'common',
      vehicle_no: resultData.vehicle_no || null,
      vehicleNo: resultData.vehicle_no || null,
      order: resultData.order_index ?? 0,
    };

    return NextResponse.json({
      preset: savedPreset,
      ...resultData,
      name: savedPreset.name,
      shortName: savedPreset.shortName,
      fullName: savedPreset.fullName,
      full_name: savedPreset.fullName,
    });
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
    const isAdmin =
      searchParams.get('is_admin') === 'true' ||
      searchParams.get('isAdmin') === 'true' ||
      req.headers.get('x-is-admin') === 'true';
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

    // 2. Strict Rule: If not admin, vehicle_no IS NULL indicates Common Master Preset (deletion forbidden)
    if (!isAdmin && !targetPreset.vehicle_no) {
      return NextResponse.json(
        { error: '공통 마스터 거점은 관리자 모드에서만 삭제할 수 있습니다.' },
        { status: 403 }
      );
    }

    // 3. Strict Rule: If not admin, only allow deletion if vehicle_no matches current vehicle
    if (!isAdmin && vehicleNo && targetPreset.vehicle_no !== vehicleNo) {
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
