import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireHqAdmin } from '@/lib/auth/serverAuth';
import { HqCustomer, CustomerContact } from '@/types/customerHq';
import { INITIAL_HQ_CUSTOMERS } from '@/utils/customerHqData';

export const dynamic = 'force-dynamic';

function normalizeCompanyName(name: string): string {
  return (name || '')
    .trim()
    .toLowerCase()
    .replace(/[(（](?:주|유|사)[)）]/g, '')
    .replace(/(주식회사|유한회사|사단법인|co\.|ltd\.|corp\.|inc\.)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * GET: Retrieve real customer list from cockpit.customers merged with CRM rich profile metadata.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const { data: dbRows, error: dbErr } = await supabaseAdmin
      .from('customers')
      .select('*')
      .order('name', { ascending: true });

    if (dbErr) {
      console.error('[HQ Customers GET] DB error:', dbErr);
      return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
    }

    // Map and merge DB rows with INITIAL_HQ_CUSTOMERS profiles
    const customerMap = new Map<string, HqCustomer>();

    // Seed with initial rich profiles
    for (const initCust of INITIAL_HQ_CUSTOMERS) {
      customerMap.set(initCust.id, { ...initCust });
    }

    for (const row of dbRows || []) {
      const existing = customerMap.get(row.id);
      const preset = (row.pricing_preset as Record<string, any>) || {};
      const presetContacts: CustomerContact[] = Array.isArray(preset.contacts) ? preset.contacts : [];

      let mergedContacts: CustomerContact[] = existing ? [...existing.contacts] : [];
      if (presetContacts.length > 0) {
        mergedContacts = presetContacts;
      } else if (mergedContacts.length === 0 && row.contact_person) {
        mergedContacts = [
          {
            id: `c-${row.id}-1`,
            name: row.contact_person,
            role: '예약 담당자',
            phone: row.phone || '',
            email: row.email || '',
            isPrimary: true,
          },
        ];
      }

      const mergedCustomer: HqCustomer = {
        id: row.id,
        name: row.name || existing?.name || '고객사',
        tier: preset.tier || existing?.tier || '일반',
        isFavorite: preset.isFavorite ?? existing?.isFavorite ?? false,
        logoType: existing?.logoType || 'default',
        logoBg: existing?.logoBg || '#1E60F3',
        logoColor: existing?.logoColor || '#FFFFFF',
        primaryContactName: row.contact_person || existing?.primaryContactName || mergedContacts[0]?.name || '',
        contactCountExtra: Math.max(0, mergedContacts.length - 1),
        recentSnippet: preset.recentSnippet || existing?.recentSnippet || 'DB 고객사 연동',
        nextEventDate: existing?.nextEventDate,
        mainPhone: row.phone || existing?.mainPhone || '',
        mainEmail: row.email || existing?.mainEmail || '',
        department: existing?.department || '의전예약',
        preferences: Array.isArray(preset.preferences) ? preset.preferences : existing?.preferences || [],
        notes: Array.isArray(preset.notes) ? preset.notes : existing?.notes || [],
        contacts: mergedContacts,
        recentRequests: existing?.recentRequests || [],
        eventsHistory: existing?.eventsHistory || [],
        tripsHistory: existing?.tripsHistory || [],
        communications: existing?.communications || [],
      };

      customerMap.set(row.id, mergedCustomer);
    }

    const customers = Array.from(customerMap.values());
    return NextResponse.json({ ok: true, customers });
  } catch (err: any) {
    console.error('[HQ Customers GET] Unhandled error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST: Create or link contact to customer in cockpit.customers DB with duplicate detection.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body = await req.json();
    const {
      companyName: rawCompany,
      contactName: rawContact,
      contactPhone = '',
      contactEmail = '',
      role = '예약 담당자',
      department = '의전예약',
      notes = '',
      sourceDraftId,
    } = body;

    const companyName = (rawCompany || '').trim();
    const contactName = (rawContact || '').trim();

    if (!companyName || companyName === '확인 필요' || companyName === '미등록 고객사') {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          message: '고객사명이 명시되지 않았습니다. 원문 확인 후 고객사명을 먼저 입력해 주세요.',
        },
        { status: 400 }
      );
    }

    if (!contactName || contactName === '확인 필요' || contactName === '담당자 미지정') {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          message: '예약 담당자명이 명시되지 않았습니다. 원문 확인 후 담당자명을 먼저 입력해 주세요.',
        },
        { status: 400 }
      );
    }

    const cleanPhone = contactPhone.includes('@') ? '' : contactPhone.trim();
    const cleanEmail = contactEmail.trim().toLowerCase();
    const targetNorm = normalizeCompanyName(companyName);

    // 1. Fetch current customers from DB to ensure deduplication
    const { data: dbRows, error: fetchErr } = await supabaseAdmin.from('customers').select('*');
    if (fetchErr) {
      return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
    }

    // Match company by normalized name or corporate email
    let matchedCompanyRow: any = null;
    let matchedContact: CustomerContact | null = null;

    for (const row of dbRows || []) {
      const rowNorm = normalizeCompanyName(row.name);
      if (rowNorm === targetNorm || row.name.trim().toLowerCase() === companyName.toLowerCase()) {
        matchedCompanyRow = row;
        break;
      }
    }

    // If company not matched by name, check unique corporate email match
    if (!matchedCompanyRow && cleanEmail && !cleanEmail.endsWith('@gmail.com') && !cleanEmail.endsWith('@naver.com') && !cleanEmail.endsWith('@daum.net')) {
      for (const row of dbRows || []) {
        if (row.email && row.email.trim().toLowerCase() === cleanEmail) {
          matchedCompanyRow = row;
          break;
        }
        const preset = (row.pricing_preset as Record<string, any>) || {};
        if (Array.isArray(preset.contacts)) {
          const cMatch = preset.contacts.find((ct: any) => (ct.email || '').trim().toLowerCase() === cleanEmail);
          if (cMatch) {
            matchedCompanyRow = row;
            matchedContact = cMatch;
            break;
          }
        }
      }
    }

    const nowIso = new Date().toISOString();

    // =========================================================================
    // CASE 1: Company exists in DB
    // =========================================================================
    if (matchedCompanyRow) {
      const preset = (matchedCompanyRow.pricing_preset as Record<string, any>) || {};
      const initCust = INITIAL_HQ_CUSTOMERS.find(
        (c) => c.id === matchedCompanyRow.id || normalizeCompanyName(c.name) === normalizeCompanyName(matchedCompanyRow.name)
      );
      const existingContacts: CustomerContact[] =
        Array.isArray(preset.contacts) && preset.contacts.length > 0
          ? preset.contacts
          : initCust?.contacts || [];

      // If contact match was not already found, search contacts
      if (!matchedContact) {
        const cleanDigits = cleanPhone.replace(/[^0-9]/g, '');
        matchedContact =
          existingContacts.find((ct) => {
            const ctEmail = (ct.email || '').trim().toLowerCase();
            const ctPhoneDigits = (ct.phone || '').replace(/[^0-9]/g, '');
            const ctName = ct.name.trim().toLowerCase();
            if (cleanEmail && ctEmail === cleanEmail) return true;
            if (cleanDigits && ctPhoneDigits && ctPhoneDigits === cleanDigits) return true;
            if (ctName === contactName.toLowerCase()) return true;
            return false;
          }) || null;

        if (!matchedContact && matchedCompanyRow.contact_person && matchedCompanyRow.contact_person.trim().toLowerCase() === contactName.toLowerCase()) {
          matchedContact = {
            id: `c-${matchedCompanyRow.id}-primary`,
            name: matchedCompanyRow.contact_person,
            role: '예약 담당자',
            phone: matchedCompanyRow.phone || cleanPhone,
            email: matchedCompanyRow.email || cleanEmail,
            isPrimary: true,
          };
        }
      }

      // Case 1-A: Contact already exists in this company
      if (matchedContact) {
        return NextResponse.json({
          ok: true,
          success: true,
          clientId: matchedCompanyRow.id,
          contactId: matchedContact.id,
          isNewCustomer: false,
          isNewContact: false,
          companyName: matchedCompanyRow.name,
          contactName: matchedContact.name,
          message: `기존 등록된 고객사 [${matchedCompanyRow.name}]의 담당자(${matchedContact.name})와 연결되었습니다.`,
        });
      }

      // Case 1-B: Contact is new to this existing company
      const newContactId = `c-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
      const newContact: CustomerContact = {
        id: newContactId,
        name: contactName,
        role: role || '예약 담당자',
        phone: cleanPhone,
        email: cleanEmail,
        department: department || '의전예약',
        isPrimary: existingContacts.length === 0,
      };

      const updatedContacts = [...existingContacts, newContact];
      const updatedNotes = notes
        ? [notes, ...(Array.isArray(preset.notes) ? preset.notes : [])]
        : Array.isArray(preset.notes) ? preset.notes : [];

      const updatedPreset = {
        ...preset,
        contacts: updatedContacts,
        notes: updatedNotes,
      };

      const { error: updateErr } = await supabaseAdmin
        .from('customers')
        .update({
          pricing_preset: updatedPreset,
          contact_person: matchedCompanyRow.contact_person || contactName,
          phone: matchedCompanyRow.phone || cleanPhone,
          email: matchedCompanyRow.email || cleanEmail,
          updated_at: nowIso,
        })
        .eq('id', matchedCompanyRow.id);

      if (updateErr) {
        console.error('[HQ Customers POST] Update error:', updateErr);
        return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        success: true,
        clientId: matchedCompanyRow.id,
        contactId: newContactId,
        isNewCustomer: false,
        isNewContact: true,
        companyName: matchedCompanyRow.name,
        contactName: newContact.name,
        message: `고객사 [${matchedCompanyRow.name}]에 새로운 담당자(${newContact.name})가 등록되었습니다.`,
      });
    }

    // =========================================================================
    // CASE 2: New Company and New Contact
    // =========================================================================
    const newCompanyId = `cust-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const newContactId = `c-${Date.now()}-1`;

    const newContact: CustomerContact = {
      id: newContactId,
      name: contactName,
      role: role || '예약 담당자',
      phone: cleanPhone,
      email: cleanEmail,
      department: department || '의전예약',
      isPrimary: true,
    };

    const newPreset = {
      tier: '일반',
      contacts: [newContact],
      notes: notes ? [notes] : [`이메일 예약을 통한 신규 등록 (${new Date().toLocaleDateString('ko-KR')})`],
      recentSnippet: `이메일 예약 접수 (${sourceDraftId || '신규'})`,
    };

    const { error: insertErr } = await supabaseAdmin.from('customers').insert({
      id: newCompanyId,
      name: companyName,
      contact_person: contactName,
      phone: cleanPhone,
      email: cleanEmail,
      pricing_preset: newPreset,
      quotes: [],
      created_at: nowIso,
      updated_at: nowIso,
    });

    if (insertErr) {
      console.error('[HQ Customers POST] Insert error:', insertErr);
      return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      success: true,
      clientId: newCompanyId,
      contactId: newContactId,
      isNewCustomer: true,
      isNewContact: true,
      companyName,
      contactName,
      message: `신규 고객사 [${companyName}] 및 담당자(${contactName})가 고객 관리에 저장되었습니다.`,
    });
  } catch (err: any) {
    console.error('[HQ Customers POST] Unhandled error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

/**
 * PUT: Update customer details (favorite, tier, notes, contacts) in cockpit.customers DB.
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body = await req.json();
    const { id, tier, isFavorite, notes, contacts, name, phone, email, contactPerson } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: '고객사 ID(id)가 필요합니다.' }, { status: 400 });
    }

    const { data: existing, error: findErr } = await supabaseAdmin
      .from('customers')
      .select('pricing_preset, name, phone, email, contact_person')
      .eq('id', id)
      .maybeSingle();

    if (findErr || !existing) {
      return NextResponse.json({ ok: false, error: '해당 고객사를 찾을 수 없습니다.' }, { status: 404 });
    }

    const currentPreset = (existing.pricing_preset as Record<string, any>) || {};
    const updatedPreset = {
      ...currentPreset,
      tier: tier !== undefined ? tier : currentPreset.tier,
      isFavorite: isFavorite !== undefined ? isFavorite : currentPreset.isFavorite,
      notes: notes !== undefined ? notes : currentPreset.notes,
      contacts: contacts !== undefined ? contacts : currentPreset.contacts,
    };

    const { error: updateErr } = await supabaseAdmin
      .from('customers')
      .update({
        name: name || existing.name,
        contact_person: contactPerson !== undefined ? contactPerson : existing.contact_person,
        phone: phone !== undefined ? phone : existing.phone,
        email: email !== undefined ? email : existing.email,
        pricing_preset: updatedPreset,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: '고객사 정보가 DB에 업데이트되었습니다.' });
  } catch (err: any) {
    console.error('[HQ Customers PUT] Unhandled error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
