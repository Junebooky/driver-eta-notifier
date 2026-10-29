/**
 * VIP LIMOUSINE KOREA - Minimal CRM Integration Utility (Issue #33 & CRM #21)
 * Manages companies (clients) and multiple contact persons with duplicate checking
 * Synchronized with live Supabase `cockpit.customers` DB table.
 */

import { HqCustomer, CustomerContact } from '@/types/customerHq';
import { INITIAL_HQ_CUSTOMERS } from '@/utils/customerHqData';
import { ensureClientAuth } from '@/utils/cockpitClientAuth';

export const CRM_CUSTOMERS_STORAGE_KEY = 'vip_hq_customers_state';
export const CRM_CUSTOMERS_UPDATE_EVENT = 'vip_hq_customers_updated';

// In-memory cache for SSR & client synchronization
let inMemoryCustomers: HqCustomer[] | null = null;

export interface FetchHqCustomersResult {
  ok: boolean;
  customers: HqCustomer[];
  error?: string;
}

/**
 * Fetch authoritative customer list directly from Supabase DB via /api/hq/customers.
 * Single Source of Truth: Does NOT fake local storage as real DB when DB returns empty or errors.
 */
export async function fetchHqCustomersFromDb(): Promise<FetchHqCustomersResult> {
  try {
    await ensureClientAuth('hq');
    const res = await fetch('/api/hq/customers');
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && Array.isArray(data.customers)) {
      saveStoredCustomers(data.customers);
      return { ok: true, customers: data.customers };
    }
    return {
      ok: false,
      customers: [],
      error: data.error || `서버 응답 오류 (${res.status})`,
    };
  } catch (err: any) {
    console.error('[CRM] Failed to fetch customers from live DB:', err);
    return {
      ok: false,
      customers: [],
      error: err.message || '네트워크 연결 오류',
    };
  }
}

/**
 * Persist or link contact to Supabase DB via /api/hq/customers
 */
export async function saveContactToCrmDb(params: SaveContactToCrmParams): Promise<SaveContactToCrmResult> {
  try {
    await ensureClientAuth('hq');
    const res = await fetch('/api/hq/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && data.success) {
      // Re-sync after successful DB write
      fetchHqCustomersFromDb().catch(() => {});
      return {
        success: true,
        clientId: data.clientId,
        contactId: data.contactId,
        isNewCustomer: Boolean(data.isNewCustomer),
        isNewContact: Boolean(data.isNewContact),
        companyName: data.companyName,
        contactName: data.contactName,
        message: data.message,
      };
    }
    return {
      success: false,
      clientId: '',
      contactId: '',
      isNewCustomer: false,
      isNewContact: false,
      companyName: params.companyName,
      contactName: params.contactName,
      message: data.message || data.error || '고객 관리에 저장하지 못했습니다.',
    };
  } catch (err: any) {
    console.error('[CRM] DB save contact error:', err);
    return {
      success: false,
      clientId: '',
      contactId: '',
      isNewCustomer: false,
      isNewContact: false,
      companyName: params.companyName,
      contactName: params.contactName,
      message: err.message || '네트워크 오류로 고객 관리에 저장하지 못했습니다.',
    };
  }
}

/**
 * Update customer details in Supabase DB via /api/hq/customers
 */
export async function updateHqCustomerInDb(customer: HqCustomer): Promise<boolean> {
  try {
    await ensureClientAuth('hq');
    const res = await fetch('/api/hq/customers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: customer.id,
        name: customer.name,
        tier: customer.tier,
        isFavorite: customer.isFavorite,
        notes: customer.notes,
        contacts: customer.contacts,
        phone: customer.mainPhone,
        email: customer.mainEmail,
        contactPerson: customer.primaryContactName,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      fetchHqCustomersFromDb().catch(() => {});
      return true;
    }
    return false;
  } catch (err) {
    console.error('[CRM] DB update customer error:', err);
    return false;
  }
}

export function getStoredCustomers(): HqCustomer[] {
  if (typeof window === 'undefined') {
    return inMemoryCustomers || [];
  }

  try {
    const raw = localStorage.getItem(CRM_CUSTOMERS_STORAGE_KEY);
    if (!raw) {
      return inMemoryCustomers || [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      inMemoryCustomers = parsed;
      return inMemoryCustomers;
    }
    return inMemoryCustomers || [];
  } catch (err) {
    console.warn('[CRM] Failed to parse stored customers:', err);
    return inMemoryCustomers || [];
  }
}

export function saveStoredCustomers(customers: HqCustomer[]): void {
  inMemoryCustomers = customers;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CRM_CUSTOMERS_STORAGE_KEY, JSON.stringify(customers));
    window.dispatchEvent(new CustomEvent(CRM_CUSTOMERS_UPDATE_EVENT, { detail: { count: customers.length } }));
  } catch (err) {
    console.error('[CRM] Failed to save customers to storage:', err);
  }
}

/**
 * Match existing company and contact to prevent duplication
 */
export function findCustomerMatch(
  companyName?: string,
  contactEmail?: string,
  contactPhone?: string
): {
  companyMatch: HqCustomer | null;
  contactMatch: CustomerContact | null;
} {
  const customers = getStoredCustomers();
  const cleanComp = (companyName || '').trim().toLowerCase();
  const cleanEmail = (contactEmail || '').trim().toLowerCase();
  const cleanPhone = (contactPhone || '').replace(/[^0-9]/g, '');

  let companyMatch: HqCustomer | null = null;
  let contactMatch: CustomerContact | null = null;

  if (cleanComp) {
    const stripCorp = (s: string) =>
      s
        .replace(/[(（](?:주|유|사)[)）]/g, '')
        .replace(/(주식회사|유한회사|사단법인|co\.|ltd\.|corp\.|inc\.)/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const normalizedTarget = stripCorp(cleanComp);

    companyMatch =
      customers.find((c) => {
        const cName = c.name.trim().toLowerCase();
        if (cName === cleanComp) return true;
        const normalizedC = stripCorp(cName);
        return normalizedC === normalizedTarget;
      }) || null;
  }

  // Check contact match within matched company, or across all companies if email is unique corporate email
  if (companyMatch) {
    contactMatch =
      companyMatch.contacts.find((ct) => {
        const ctEmail = (ct.email || '').trim().toLowerCase();
        const ctPhone = (ct.phone || '').replace(/[^0-9]/g, '');
        if (cleanEmail && ctEmail === cleanEmail) return true;
        if (cleanPhone && ctPhone && ctPhone === cleanPhone) return true;
        return false;
      }) || null;
  } else if (cleanEmail && !cleanEmail.endsWith('@gmail.com') && !cleanEmail.endsWith('@naver.com') && !cleanEmail.endsWith('@daum.net')) {
    // Unique corporate email match
    for (const c of customers) {
      const found = c.contacts.find((ct) => (ct.email || '').trim().toLowerCase() === cleanEmail);
      if (found) {
        companyMatch = c;
        contactMatch = found;
        break;
      }
    }
  }

  return { companyMatch, contactMatch };
}

export interface SaveContactToCrmParams {
  companyName: string;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  role?: string;
  department?: string;
  notes?: string;
  sourceDraftId?: string;
}

export interface SaveContactToCrmResult {
  success: boolean;
  clientId: string;
  contactId: string;
  isNewCustomer: boolean;
  isNewContact: boolean;
  companyName: string;
  contactName: string;
  message: string;
}

/**
 * Explicitly save or link contact and company into CRM
 * Triggered strictly by administrator action ('고객 관리에 저장')
 * Awaits server-confirmed IDs from /api/hq/customers DB endpoint.
 */
export async function saveContactToCrm(params: SaveContactToCrmParams): Promise<SaveContactToCrmResult> {
  if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
    return saveContactToCrmDb(params);
  }
  return saveContactToCrmLocal(params);
}

/**
 * Pure local in-memory/localStorage save utility for offline or unit-test environments
 */
export function saveContactToCrmLocal(params: SaveContactToCrmParams): SaveContactToCrmResult {
  const {
    companyName: rawCompany,
    contactName: rawContact,
    contactPhone = '',
    contactEmail = '',
    role = '예약 담당자',
    department = '의전예약',
    notes = '',
    sourceDraftId,
  } = params;

  const companyName = (rawCompany || '').trim();
  const contactName = (rawContact || '').trim();

  if (!companyName || companyName === '확인 필요' || companyName === '미등록 고객사') {
    return {
      success: false,
      clientId: '',
      contactId: '',
      isNewCustomer: false,
      isNewContact: false,
      companyName: '',
      contactName: '',
      message: '고객사명이 명시되지 않았습니다. 원문 확인 후 고객사명을 먼저 입력해 주세요.',
    };
  }

  if (!contactName || contactName === '확인 필요' || contactName === '담당자 미지정') {
    return {
      success: false,
      clientId: '',
      contactId: '',
      isNewCustomer: false,
      isNewContact: false,
      companyName,
      contactName: '',
      message: '예약 담당자명이 명시되지 않았습니다. 원문 확인 후 담당자명을 먼저 입력해 주세요.',
    };
  }

  const customers = [...getStoredCustomers()];
  const { companyMatch, contactMatch } = findCustomerMatch(companyName, contactEmail, contactPhone);

  const cleanPhone = contactPhone.includes('@') ? '' : contactPhone; // NEVER allow email in phone

  // Case 1: Company exists
  if (companyMatch) {
    const existingCompIndex = customers.findIndex((c) => c.id === companyMatch.id);

    // Case 1-A: Contact already exists in company
    if (contactMatch) {
      return {
        success: true,
        clientId: companyMatch.id,
        contactId: contactMatch.id,
        isNewCustomer: false,
        isNewContact: false,
        companyName: companyMatch.name,
        contactName: contactMatch.name,
        message: `기존 등록된 고객사 [${companyMatch.name}]의 담당자(${contactMatch.name})와 연결되었습니다.`,
      };
    }

    // Case 1-B: Company exists, but this contact is new
    const newContactId = `c-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const newContact: CustomerContact = {
      id: newContactId,
      name: contactName,
      role: role || '예약 담당자',
      phone: cleanPhone,
      email: contactEmail,
      department: department || '의전예약',
      isPrimary: false,
    };

    const updatedCompany: HqCustomer = {
      ...companyMatch,
      contactCountExtra: (companyMatch.contactCountExtra || 0) + 1,
      contacts: [...companyMatch.contacts, newContact],
      notes: notes ? [notes, ...(companyMatch.notes || [])] : companyMatch.notes,
    };

    customers[existingCompIndex] = updatedCompany;
    saveStoredCustomers(customers);

    // Persist to Supabase cockpit.customers DB
    if (typeof window !== 'undefined') {
      saveContactToCrmDb(params).catch((err) => {
        console.warn('[CRM] Background DB sync warning:', err);
      });
    }

    return {
      success: true,
      clientId: companyMatch.id,
      contactId: newContactId,
      isNewCustomer: false,
      isNewContact: true,
      companyName: companyMatch.name,
      contactName: newContact.name,
      message: `고객사 [${companyMatch.name}]에 새로운 담당자(${newContact.name})가 등록되었습니다.`,
    };
  }

  // Case 2: New Company and New Contact
  const newCompanyId = `cust-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const newContactId = `c-${Date.now()}-1`;

  const newContact: CustomerContact = {
    id: newContactId,
    name: contactName,
    role: role || '예약 담당자',
    phone: cleanPhone,
    email: contactEmail,
    department: department || '의전예약',
    isPrimary: true,
  };

  const newCustomer: HqCustomer = {
    id: newCompanyId,
    name: companyName,
    tier: '일반',
    isFavorite: false,
    logoType: 'default',
    logoBg: '#1E60F3',
    logoColor: '#FFFFFF',
    primaryContactName: contactName,
    contactCountExtra: 0,
    recentSnippet: `이메일 예약 접수 (${sourceDraftId || '신규'})`,
    mainPhone: cleanPhone,
    mainEmail: contactEmail,
    department: department || '의전예약',
    preferences: ['의전 리무진', '정시 배차'],
    notes: notes ? [notes] : [`이메일 예약을 통한 신규 등록 (${new Date().toLocaleDateString('ko-KR')})`],
    recentRequests: [],
    contacts: [newContact],
    eventsHistory: [],
    tripsHistory: [],
    communications: [
      {
        id: `comm-${Date.now()}`,
        channel: 'email',
        sender: contactName,
        date: new Date().toLocaleDateString('ko-KR'),
        summary: `이메일 예약 접수 - ${companyName}`,
      },
    ],
  };

  customers.unshift(newCustomer);
  saveStoredCustomers(customers);

  // Persist to Supabase cockpit.customers DB
  if (typeof window !== 'undefined') {
    saveContactToCrmDb(params).catch((err) => {
      console.warn('[CRM] Background DB sync warning:', err);
    });
  }

  return {
    success: true,
    clientId: newCompanyId,
    contactId: newContactId,
    isNewCustomer: true,
    isNewContact: true,
    companyName: newCustomer.name,
    contactName: newContact.name,
    message: `신규 고객사 [${newCustomer.name}] 및 담당자(${newContact.name})가 고객 관리에 저장되었습니다.`,
  };
}
