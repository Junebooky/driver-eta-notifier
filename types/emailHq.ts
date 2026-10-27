export type EmailCandidateClassification = 'booking_candidate' | 'uncertain' | 'unrelated';

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
