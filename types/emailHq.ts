/**
 * VIP LIMOUSINE KOREA - HQ Email & AI Booking Assistant Types
 */

export type EmailProvider = 'naver' | 'gmail';

export type EmailCandidateClassification =
  | 'booking_candidate' // Positive booking/quote/itinerary request
  | 'unrelated'         // Spam, newsletter, internal system notification
  | 'uncertain';        // Ambiguous, requires admin review

export type EmailAiStatus =
  | 'not_analyzed'     // Not yet processed by AI
  | 'candidate'        // Identified as booking candidate by heuristic
  | 'analyzing'        // Currently being processed by Gemini
  | 'draft_generated'  // AI has extracted structured booking draft
  | 'needs_review'     // Missing required fields or ambiguous details
  | 'skipped';         // Excluded as unrelated

export type EmailTripType =
  | 'single'          // Standard single trip
  | 'group'           // Multi-vehicle / group booking
  | 'modification'    // Change to existing booking
  | 'cancellation';   // Cancellation request

export interface HqGroupTripItem {
  id: string;
  passengerName: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupTime: string;
  vehicleClass?: string;
  assignedDriver?: string;
  notes?: string;
}

export interface HqEmailExtractedDraft {
  id: string;
  emailId: string;
  passengerName: string;
  passengerPhone: string;
  passengerCount: number;
  luggageCount: number;
  pickupDate: string; // YYYY-MM-DD
  pickupTime: string; // HH:MM
  pickupLocation: string;
  dropoffLocation: string;
  flightNumber: string;
  requestedVehicleClass: string;
  specialRequests: string;
  tripType: EmailTripType;
  groupTrips?: HqGroupTripItem[];
  confidence: number; // 0 to 1
  warnings: string[];
  
  // Mandatory manual assignment by administrator
  assignedDriver: string | null;
  assignedVehicle: string | null;
  assignedVehiclePlate: string | null;

  // Status
  status: 'draft' | 'saved' | 'published';
  updatedAt: string;
  associatedBookingId?: string | null;
}

export interface HqEmailSummary {
  id: string;
  uid: number;
  provider: EmailProvider;
  from: {
    name: string;
    address: string;
  };
  to: string[];
  subject: string;
  receivedAt: string;
  dateIso: string;
  isUnread: boolean;
  flags: string[];
  preview: string;
  hasAttachments: boolean;
  candidateClassification: EmailCandidateClassification;
  aiStatus: EmailAiStatus;
  matchedKeywords?: string[];
  draftId?: string;
}

export interface HqEmailDetail extends HqEmailSummary {
  bodyText: string;
  bodyHtmlSanitized?: string;
  headers?: Record<string, string>;
  extractedDraft?: HqEmailExtractedDraft | null;
}

export interface HqEmailKpiSummary {
  totalCount: number;
  candidateCount: number;
  draftGeneratedCount: number;
  needsReviewCount: number;
  unreadCount: number;
  lastSyncTime: string;
  isConnected: boolean;
  accountEmail: string;
}
