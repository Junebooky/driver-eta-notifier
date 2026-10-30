import { CustomerContractTerms } from './settlementHq';

export type CustomerTier = 'VIP' | '주요' | '일반';

export interface CustomerContact {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  department?: string;
  language?: string;
  isPrimary?: boolean;
}

export interface CustomerRequestItem {
  id: string;
  content: string;
  date: string;
  category?: 'time_change' | 'vehicle_add' | 'driver_lang' | 'amenity' | 'general';
  status?: 'pending' | 'resolved' | 'acknowledged';
}

export interface CustomerEventItem {
  id: string;
  title: string;
  date: string;
  dDay: string;
  location: string;
  vehiclesRequired: string;
  passengerCount: number;
  timeRange: string;
  status?: 'upcoming' | 'ongoing' | 'completed';
  orderingAgency?: string;
  endBrand?: string;
  billingTarget?: 'ordering_agency' | 'end_brand' | 'custom';
  billingTargetName?: string;
  groupId?: string;
  settlementReportId?: string;
}

export interface CustomerTripItem {
  id: string;
  date: string;
  route: string;
  vehicleDetails: string;
  driverName?: string;
  vehicleModel?: string;
  fare?: string;
}

export interface CustomerCommunicationItem {
  id: string;
  channel: 'email' | 'call' | 'whatsapp' | 'meeting';
  sender: string;
  date: string;
  summary: string;
  detail?: string;
}

export interface HqCustomer {
  id: string;
  name: string;
  tier: CustomerTier;
  isFavorite: boolean;
  logoType?: 'chanel' | 'intercos' | 'bmw' | 'netflix' | 'ferrari' | 'shinsegae' | 'samsung' | 'hyundai' | 'default';
  logoBg?: string;
  logoColor?: string;
  primaryContactName: string;
  contactCountExtra: number;
  recentSnippet: string;
  nextEventDate?: string;
  mainPhone: string;
  mainEmail: string;
  department: string;
  preferences: string[];
  notes: string[];
  contractTerms?: CustomerContractTerms;
  associatedAgencies?: string[];
  nextEvent?: CustomerEventItem;
  recentTrip?: CustomerTripItem;
  recentRequests: CustomerRequestItem[];
  contacts: CustomerContact[];
  eventsHistory: CustomerEventItem[];
  tripsHistory: CustomerTripItem[];
  communications: CustomerCommunicationItem[];
}
export type { CustomerContractTerms };

