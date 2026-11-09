/**
 * VIP LIMOUSINE KOREA - HQ Email & AI Booking Assistant Types
 */

export type EmailProvider = 'naver' | 'gmail' | 'demo';

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

export interface AvailableDriverItem {
  id: string;
  name: string;
  rating: number;
  reviewCount: number;
  flags: string[];
  languages: string[];
  languageCodes?: ('ko' | 'en')[];
  affiliation: string;
  careerYears: number;
  residence: string;
  avatarUrl: string;
  recentTrips: { date: string; route: string }[];
  isAvailable: boolean;
  phone?: string;
  plate?: string;
  vehicleModel?: string;
}

export interface VehicleSlotAssignment {
  slotIndex: number;
  vehicleModel: string;
  driver: AvailableDriverItem | null;
  status: 'unassigned' | 'assigned';
}

export interface RouteWaypointItem {
  id: string;
  order: number;
  date?: string; // YYYY-MM-DD or MM/DD (e.g. "2026-10-28")
  time?: string; // HH:MM (e.g. "10:00")
  location: string; // e.g. "인천공항 제1터미널 (T1)"
  address?: string; // Verified TMAP address, only populated after manual POI confirmation.
  clientAddress?: string; // Address quoted verbatim from the client email; NEVER verified coordinates.
  lat?: number;
  lng?: number;
  isPoiConfirmed?: boolean;
  notes?: string;
}

export interface EmailFlightLeg {
  flightNumber: string;
  date: string; // Departure date shown in the client itinerary.
  originAirport?: string;
  destinationAirport?: string;
  scheduledDeparture?: string; // Airport-local scheduled HH:mm from email.
  scheduledArrival?: string;
  passengers?: string[];
  role?: 'arrival' | 'departure' | 'connection' | 'unknown';
}

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

  // Raw Email Header Info
  senderName?: string;
  senderEmail?: string;
  replyTo?: string;

  // Client Organization & Reservation Coordinator (Contact Entity)
  companyName?: string;
  /** Separate event title; never confuse customer company with the event name. */
  eventName?: string;
  contactName?: string;
  contactPhone?: string; // Strictly phone number or empty, NEVER email
  contactEmail?: string;
  contactSource?: 'body' | 'signature' | 'from' | 'reply-to';
  contactConfidence?: number;

  // Actual Passenger Entity (Riding in the vehicle)
  passengerName: string;
  passengerNames?: string[]; // All named riders, separate from the reservation coordinator.
  passengerPhone: string; // Strictly phone number or empty, NEVER email
  passengerCount: number;

  // Schedule & Route with POI Confirmation
  savedScheduleIds?: Record<string,string>;
  dayEndTimes?: Record<string,string>;
  /** AI classifies whether the received revision replaces the entire route or only changes parts. */
  revisionScope?: 'full' | 'partial' | 'unknown';
  /** Explicit HQ selection, never picked by AI. */
  revisionMatchedScheduleId?: string;
  revisionMatchedVersion?: number;
  sourceMessageId?: string;
  sourceSenderEmail?: string;
  sourceAttachments?: Array<{ filename: string; kind: 'excel' | 'pdf' | 'docx'; sha256: string }>;
  documentAnalysis?: Array<{ filename: string; kind: 'excel' | 'pdf' | 'docx'; reviewedSheets: string[]; missingDates?: string[]; dateReviewAcknowledged?: boolean }>;
  sourceInReplyTo?: string;
  sourceReferences?: string[];
  pickupDate: string; // YYYY-MM-DD
  pickupTime: string; // HH:MM
  pickupLocation: string;
  pickupAddress?: string; // Official verified TMAP address, never guessed by the AI.
  pickupProvidedAddress?: string; // Unverified address from the client.
  pickupDetailNotes?: string; // Gate, floor, terminal notes
  pickupLat?: number;
  pickupLng?: number;
  isPickupPoiConfirmed?: boolean;

  dropoffLocation: string;
  dropoffAddress?: string; // Official verified TMAP address, never guessed by the AI.
  dropoffProvidedAddress?: string; // Unverified address from the client.
  dropoffDetailNotes?: string;
  dropoffLat?: number;
  dropoffLng?: number;
  isDropoffPoiConfirmed?: boolean;

  // Multiple destinations / itinerary waypoints (when schedule visits multiple locations in a day)
  waypoints?: RouteWaypointItem[];

  flightNumber: string; // Backward-compatible primary flight only.
  flights?: EmailFlightLeg[]; // Every leg, including multiple arrivals and onward connections.
  requestedVehicleClass: string;
  specialRequests: string;
  /** Operator-approved language requirement, independent of free-text notes. */
  requestedLanguage?: 'ko' | 'en';
  tripType: EmailTripType;
  groupTrips?: HqGroupTripItem[];
  confidence: number; // 0 to 1
  warnings: string[];

  // CRM Linkage (#21)
  clientId?: string | null;
  contactId?: string | null;
  isSavedToCrm?: boolean;
  
  // Mandatory manual assignment by administrator
  assignedDriver: string | null;
  assignedVehicle: string | null;
  assignedVehiclePlate: string | null;

  // Status
  status: 'draft' | 'saved' | 'published';
  updatedAt: string;
  associatedBookingId?: string | null;

  // Legacy optional compatibility (excluded from new reservation UI)
  luggageCount?: number;
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
  attachments?: Array<{ filename: string; contentType: string; size: number }>;
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

export interface HqEmailItem {
  id: string;
  messageId: string;
  from: string;
  senderName: string;
  to: string[];
  subject: string;
  receivedAt: string;
  snippet: string;
  bodyText?: string;
  bodyHtml?: string;
  hasAttachments?: boolean;
  classification: EmailCandidateClassification;
  classificationReason?: string;
  isRead: boolean;
  isStarred?: boolean;
  draftStatus: 'none' | 'draft_created' | 'published';
  linkedDraftId?: string;
}

export interface EmailExtractionCostLog {
  id: string;
  emailId: string;
  messageId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  estimatedCostKrw: number;
  extractedAt: string;
  draftScheduleId?: string;
  status: 'success' | 'dedup_cached' | 'error';
}

export interface ExtractedEmailBookingDraft {
  emailId: string;
  messageId: string;
  clientName: string;
  passengerName?: string;
  passengerPhone?: string;
  date: string;
  pickupTime: string;
  origin: string;
  destination: string;
  flightNumber?: string;
  vehicleRequest?: string;
  notes?: string;
  needsPlaceResolution: boolean;
  costLog: EmailExtractionCostLog;
}
