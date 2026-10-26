import { ReportMode } from './index';

export type TranslationSource = 'approved' | 'cache' | 'google' | 'fallback';

export interface PlaceTranslationRecord {
  place_id?: string;
  name_ko: string;
  name_en_short: string;
  translation_source: TranslationSource;
  last_verified_at: string;
  is_uncertain?: boolean;
}

export interface PlaceTranslationRequest {
  name: string;
  shortName?: string;
  id?: string;
  address?: string;
  lat?: number;
  lng?: number;
}

export interface GenerateEnglishReportParams {
  vehicleNo?: string;
  originEn: string;
  destinationEn: string;
  waypointsEn?: string[];
  etaFormatted?: string;
  mode: ReportMode;
}
