/**
 * VIP LIMOUSINE KOREA - HQ Email & Booking Draft Storage
 * Uses localStorage with useSyncExternalStore hooks and dispatch conversion
 */

import { HqEmailExtractedDraft, EmailAiStatus } from '@/types/emailHq';
import { HqBooking } from '@/types/hq';
import { getKstTodayDateStr } from '@/utils/dispatchConflictDetector';

export const HQ_EMAIL_DRAFTS_STORAGE_KEY = 'vip_hq_email_drafts';
export const HQ_EMAIL_SETTINGS_STORAGE_KEY = 'vip_hq_email_settings';
export const HQ_EMAIL_STATUS_OVERRIDES_KEY = 'vip_hq_email_status_overrides';
export const HQ_EMAIL_UPDATE_EVENT = 'vip_hq_email_updated';

export interface EmailHqSettings {
  autoAiCandidateExtraction: boolean; // Default false per spec
  hasAcceptedAiNotice: boolean;
  filterProvider: 'all' | 'naver' | 'gmail';
}

const DEFAULT_SETTINGS: EmailHqSettings = {
  autoAiCandidateExtraction: false,
  hasAcceptedAiNotice: false,
  filterProvider: 'all',
};

const EMPTY_DRAFTS: Record<string, HqEmailExtractedDraft> = {};

// Snapshot caches for referential stability in useSyncExternalStore
let cachedDraftsRaw = '';
let cachedDraftsSnapshot: Record<string, HqEmailExtractedDraft> = EMPTY_DRAFTS;

export const subscribeEmailStorage = (callback: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(HQ_EMAIL_UPDATE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(HQ_EMAIL_UPDATE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
};

export const getEmailDraftsSnapshot = (): Record<string, HqEmailExtractedDraft> => {
  if (typeof window === 'undefined') return EMPTY_DRAFTS;
  try {
    const raw = localStorage.getItem(HQ_EMAIL_DRAFTS_STORAGE_KEY);
    if (!raw) return EMPTY_DRAFTS;
    if (raw === cachedDraftsRaw) return cachedDraftsSnapshot;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      cachedDraftsRaw = raw;
      cachedDraftsSnapshot = parsed;
      return cachedDraftsSnapshot;
    }
    return EMPTY_DRAFTS;
  } catch {
    return EMPTY_DRAFTS;
  }
};

export const getEmailDraftsServerSnapshot = (): Record<string, HqEmailExtractedDraft> => {
  return EMPTY_DRAFTS;
};

/**
 * Get all stored drafts
 */
export function getAllEmailDrafts(): Record<string, HqEmailExtractedDraft> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(HQ_EMAIL_DRAFTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Get single draft by email ID
 */
export function getEmailDraft(emailId: string): HqEmailExtractedDraft | null {
  const drafts = getAllEmailDrafts();
  return drafts[emailId] || null;
}

/**
 * Save draft to localStorage and notify subscribers
 */
export function saveEmailDraft(draft: HqEmailExtractedDraft): void {
  if (typeof window === 'undefined') return;
  try {
    const drafts = getAllEmailDrafts();
    drafts[draft.emailId] = {
      ...draft,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(HQ_EMAIL_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    window.dispatchEvent(new CustomEvent(HQ_EMAIL_UPDATE_EVENT, { detail: { emailId: draft.emailId } }));
  } catch (err) {
    console.error('Failed to save email draft:', err);
  }
}

/**
 * Get Email Settings (e.g. AI auto-analysis toggle)
 */
export function getEmailSettings(): EmailHqSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(HQ_EMAIL_SETTINGS_STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Update Email Settings
 */
export function saveEmailSettings(settings: Partial<EmailHqSettings>): EmailHqSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const current = getEmailSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(HQ_EMAIL_SETTINGS_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(HQ_EMAIL_UPDATE_EVENT, { detail: { settings: updated } }));
    return updated;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save AI status override for an email
 */
export function setEmailStatusOverride(emailId: string, status: EmailAiStatus): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(HQ_EMAIL_STATUS_OVERRIDES_KEY);
    const overrides = raw ? JSON.parse(raw) : {};
    overrides[emailId] = status;
    localStorage.setItem(HQ_EMAIL_STATUS_OVERRIDES_KEY, JSON.stringify(overrides));
    window.dispatchEvent(new CustomEvent(HQ_EMAIL_UPDATE_EVENT, { detail: { emailId, status } }));
  } catch (err) {
    console.error('Failed to save email status override:', err);
  }
}

export function getEmailStatusOverrides(): Record<string, EmailAiStatus> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(HQ_EMAIL_STATUS_OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Convert an approved Email Draft into a standard HqBooking object
 * Validates that driver and vehicle have been manually assigned by admin.
 */
export function convertDraftToHqBooking(draft: HqEmailExtractedDraft): {
  success: boolean;
  booking?: HqBooking;
  error?: string;
} {
  if (!draft.assignedDriver) {
    return { success: false, error: '배차할 담당 기사를 선택해주세요.' };
  }
  if (!draft.assignedVehicle) {
    return { success: false, error: '배차할 차량을 선택해주세요.' };
  }
  if (!draft.pickupLocation || !draft.dropoffLocation) {
    return { success: false, error: '출발지와 도착지 정보를 입력해주세요.' };
  }

  const bookingNo = `BK-${new Date().getFullYear().toString().slice(2)}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`;

  const newBooking: HqBooking = {
    id: `booking-${Date.now()}`,
    bookingNo,
    no: 99,
    customerName: draft.passengerName.includes('모건스탠리')
      ? '모건스탠리 아시아'
      : draft.passengerName.includes('구글')
        ? '구글 클라우드'
        : 'VIP 고객',
    pickupDate: draft.pickupDate || getKstTodayDateStr(),
    pickupTime: draft.pickupTime || '14:00',
    pickupLocation: draft.pickupLocation,
    destination: draft.dropoffLocation,
    driverName: draft.assignedDriver,
    driverPhone: '010-8842-1920',
    vehicleModel: draft.assignedVehicle,
    vehiclePlate: draft.assignedVehiclePlate || '116허 1514',
    dispatchStatus: '배차 완료',
    driverAck: '미확인',
    customerBrochure: '미발송',
    passengerCount: draft.passengerCount || 1,
    passengerName: draft.passengerName,
    passengerPhone: draft.passengerPhone || '010-0000-0000',
    notes: draft.specialRequests,
    isToday: true,
    isDispatchTarget: true,
  };

  return {
    success: true,
    booking: newBooking,
  };
}
