'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ReportMode, LocationPreset, DriverProfile } from '@/types';
import { FileText, Play, Square, Copy, Check, Globe, Loader2 } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import {
  getShortEnglishPlaceName,
  generateEnglishReportText,
  getReportVehicleNo,
  lookupApprovedAlias,
} from '@/utils/locationTranslation';

interface ReportTemplateSelectorProps {
  currentMode: ReportMode;
  onSelectMode: (mode: ReportMode) => void;
  reportPreviewText: string;
  // External context to generate dynamic English reports
  profile?: DriverProfile;
  origin?: LocationPreset | string;
  destination?: LocationPreset | string;
  waypoints?: (LocationPreset | string)[];
  etaFormatted?: string;
  // Real-time synchronization with ActionPanel / parent state
  onActiveReportTextChange?: (text: string, language: 'ko' | 'en') => void;
}

interface PlaceCacheEntry {
  key: string;
  enName: string;
}

export const ReportTemplateSelector: React.FC<ReportTemplateSelectorProps> = ({
  currentMode,
  onSelectMode,
  reportPreviewText,
  profile,
  origin,
  destination,
  waypoints = [],
  etaFormatted,
  onActiveReportTextChange,
}) => {
  const [copySuccess, setCopySuccess] = useState(false);
  const [language, setLanguage] = useState<'ko' | 'en'>('ko');
  const [isTranslating, setIsTranslating] = useState(false);

  // Cached English place translations with key validation to prevent displaying old places
  const [cachedOrigin, setCachedOrigin] = useState<PlaceCacheEntry | null>(null);
  const [cachedDest, setCachedDest] = useState<PlaceCacheEntry | null>(null);
  const [cachedWaypoints, setCachedWaypoints] = useState<string[]>([]);

  const isDeparture = currentMode === 'DEPARTURE';

  // Compute stable keys for origin and destination
  const currentOriginKey =
    typeof origin === 'string'
      ? origin
      : origin?.id || origin?.shortName || origin?.name || 'Current Location';
  const currentDestKey =
    typeof destination === 'string'
      ? destination
      : destination?.id || destination?.shortName || destination?.name || 'Destination';

  const prevOriginKeyRef = useRef(currentOriginKey);
  const prevDestKeyRef = useRef(currentDestKey);

  // Helper to re-generate the English text using current cached places & mode
  const buildEnglishText = useCallback(() => {
    const vNo = getReportVehicleNo(profile);

    // Resolve Origin English Name: Check key match, then approved alias, then raw
    let originEn = '';
    if (cachedOrigin && cachedOrigin.key === currentOriginKey) {
      originEn = cachedOrigin.enName;
    } else {
      const placeReq = typeof origin === 'string'
        ? { name: origin, shortName: origin }
        : origin ? { name: origin.name, shortName: origin.shortName, id: origin.id } : { name: '현 위치' };
      const approvedO = lookupApprovedAlias(placeReq);
      originEn =
        approvedO ||
        (typeof origin === 'string' ? origin : origin?.shortName || origin?.name || 'Current Location');
    }

    // Resolve Destination English Name: Check key match, then approved alias, then raw
    let destEn = '';
    if (cachedDest && cachedDest.key === currentDestKey) {
      destEn = cachedDest.enName;
    } else {
      const placeReq = typeof destination === 'string'
        ? { name: destination, shortName: destination }
        : destination ? { name: destination.name, shortName: destination.shortName, id: destination.id } : { name: '목적지' };
      const approvedD = lookupApprovedAlias(placeReq);
      destEn =
        approvedD ||
        (typeof destination === 'string'
          ? destination
          : destination?.shortName || destination?.name || 'Destination');
    }

    return generateEnglishReportText({
      vehicleNo: vNo,
      originEn,
      destinationEn: destEn,
      waypointsEn: cachedWaypoints,
      etaFormatted,
      mode: currentMode,
    });
  }, [
    profile,
    cachedOrigin,
    currentOriginKey,
    origin,
    cachedDest,
    currentDestKey,
    destination,
    cachedWaypoints,
    etaFormatted,
    currentMode,
  ]);

  // Dynamic English text computed during render
  const englishReportText = useMemo(() => {
    return buildEnglishText();
  }, [buildEnglishText]);

  // Current active display text (Task 1: The Copy button always copies the exact text currently displayed)
  const displayedReportText = language === 'en' ? englishReportText : reportPreviewText;

  // Propagate active text change to parent when displayedReportText changes
  useEffect(() => {
    onActiveReportTextChange?.(displayedReportText, language);
  }, [displayedReportText, language, onActiveReportTextChange]);

  // Invalidate old translations when departure/destination changes while in English mode (Task 6)
  useEffect(() => {
    const originChanged = currentOriginKey !== prevOriginKeyRef.current;
    const destChanged = currentDestKey !== prevDestKeyRef.current;

    if (originChanged) {
      prevOriginKeyRef.current = currentOriginKey;
    }
    if (destChanged) {
      prevDestKeyRef.current = currentDestKey;
    }

    // Only fetch if in English mode and place changed
    if ((originChanged || destChanged) && language === 'en') {
      let isMounted = true;
      setIsTranslating(true);

      Promise.all([
        getShortEnglishPlaceName(origin || '현 위치'),
        getShortEnglishPlaceName(destination || '목적지'),
      ])
        .then(([oRec, dRec]) => {
          if (isMounted) {
            setCachedOrigin({ key: currentOriginKey, enName: oRec.name_en_short });
            setCachedDest({ key: currentDestKey, enName: dRec.name_en_short });
          }
        })
        .catch((err) => {
          console.warn('[ReportTemplateSelector] Re-translation error:', err);
        })
        .finally(() => {
          if (isMounted) {
            setIsTranslating(false);
          }
        });

      return () => {
        isMounted = false;
      };
    }
  }, [currentOriginKey, currentDestKey, language, origin, destination]);

  // Language Toggle Handler (Globe button)
  const handleToggleLanguage = async () => {
    haptics.lightTap();

    if (language === 'en') {
      // Task 6: Switching back to Korean must not trigger API requests
      setLanguage('ko');
      return;
    }

    // Toggle to English
    setIsTranslating(true);
    try {
      // 1. Resolve Origin & Destination English names
      const [originRecord, destRecord] = await Promise.all([
        getShortEnglishPlaceName(origin || '현 위치'),
        getShortEnglishPlaceName(destination || '목적지'),
      ]);

      // 2. Resolve Waypoints if any
      let wpRecords: string[] = [];
      if (waypoints && waypoints.length > 0) {
        const resolvedWps = await Promise.all(
          waypoints.map((wp) => getShortEnglishPlaceName(wp))
        );
        wpRecords = resolvedWps.map((r) => r.name_en_short);
      }

      setCachedOrigin({ key: currentOriginKey, enName: originRecord.name_en_short });
      setCachedDest({ key: currentDestKey, enName: destRecord.name_en_short });
      setCachedWaypoints(wpRecords);
      setLanguage('en');
    } catch (err) {
      console.warn('[ReportTemplateSelector] Translation fallback triggered:', err);
      // Fallback: activate English mode with preserved names
      setLanguage('en');
    } finally {
      setIsTranslating(false);
    }
  };

  // Minimal Header Copy Action (copies whichever language is currently displayed)
  const handleCopyMinimal = () => {
    haptics.success();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(displayedReportText);
    }
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 1500);
  };

  return (
    <div className="w-full bg-white border border-slate-100/80 rounded-2xl p-4 shadow-[0_8px_25px_rgba(30,96,243,0.06)] space-y-3 select-none">
      {/* Header: Title with electric cobalt document icon */}
      <div className="flex items-center space-x-2">
        <div className="w-5 h-5 rounded-md bg-[#1E60F3] text-white flex items-center justify-center shadow-[0_2px_6px_rgba(30,96,243,0.3)]">
          <FileText className="w-3.5 h-3.5 text-white" />
        </div>
        <h3 className="text-base font-bold text-slate-900 tracking-tight">단톡방 보고</h3>
      </div>

      {/* Mode Selector: Unified Sliding Segmented Control */}
      <div className="w-full bg-slate-100/90 p-1 rounded-full relative flex items-center select-none shadow-inner">
        {/* Sliding Indicator Pill */}
        <div
          className={`w-[calc(50%-4px)] h-[calc(100%-8px)] absolute top-1 left-1 rounded-full bg-[#1E60F3] shadow-[0_4px_14px_rgba(30,96,243,0.35)] transition-transform duration-300 ease-out pointer-events-none transform ${
            isDeparture ? 'translate-x-0' : 'translate-x-full'
          }`}
        />

        {/* Departure Tab */}
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onSelectMode('DEPARTURE');
          }}
          className="flex-1 py-2.5 rounded-full z-10 flex items-center justify-center space-x-2 cursor-pointer transition-colors duration-300"
        >
          <div
            className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-300 ${
              isDeparture ? 'bg-white/20 text-white' : 'text-slate-400'
            }`}
          >
            <Play className={`w-3 h-3 ml-0.5 ${isDeparture ? 'fill-white text-white' : 'fill-slate-400 text-slate-400'}`} />
          </div>
          <span
            className={`text-sm tracking-tight transition-colors duration-300 ${
              isDeparture ? 'text-white font-black' : 'text-slate-500 font-semibold'
            }`}
          >
            출발
          </span>
        </button>

        {/* Arrived Tab */}
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onSelectMode('ARRIVED');
          }}
          className="flex-1 py-2.5 rounded-full z-10 flex items-center justify-center space-x-2 cursor-pointer transition-colors duration-300"
        >
          <div
            className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-300 ${
              !isDeparture ? 'bg-white/20 text-white' : 'text-slate-400'
            }`}
          >
            <Square className={`w-2.5 h-2.5 ${!isDeparture ? 'fill-white text-white' : 'fill-slate-400 text-slate-400'}`} />
          </div>
          <span
            className={`text-sm tracking-tight transition-colors duration-300 ${
              !isDeparture ? 'text-white font-black' : 'text-slate-500 font-semibold'
            }`}
          >
            도착
          </span>
        </button>
      </div>

      {/* Live Report Preview Box (Stabilized Height to prevent Action Button Layout Shift) */}
      <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-3 space-y-2">
        <div className="text-sm text-slate-400 font-normal px-0.5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span>보고 텍스트 미리보기</span>
            {language === 'en' && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-[#1E60F3] border border-blue-200/60">
                EN
              </span>
            )}
          </div>

          {/* Action Buttons: Globe (left) & Copy (right) */}
          <div className="flex items-center space-x-1.5">
            {/* Task 1: Globe Button immediately to the LEFT of the Copy button with circular button style */}
            <button
              type="button"
              onClick={handleToggleLanguage}
              disabled={isTranslating}
              className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all active:scale-90 cursor-pointer ${
                language === 'en'
                  ? 'bg-blue-50 hover:bg-blue-100 text-[#1E60F3] border-blue-200/80 shadow-[0_2px_6px_rgba(30,96,243,0.15)]'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200/80'
              }`}
              title={language === 'en' ? '한국어 보고서로 전환' : 'Switch to English Report'}
              aria-label="보고서 언어 전환"
            >
              {isTranslating ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#1E60F3]" />
              ) : (
                <Globe className={`w-4 h-4 ${language === 'en' ? 'text-[#1E60F3]' : 'text-slate-600'}`} />
              )}
            </button>

            {/* Existing Copy Button with circular button style */}
            <button
              type="button"
              onClick={handleCopyMinimal}
              className="w-8 h-8 rounded-full border border-slate-200/80 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all active:scale-90 cursor-pointer"
              title="양식 복사"
              aria-label="양식 복사"
            >
              {copySuccess ? (
                <Check className="w-4 h-4 text-[#1E60F3]" />
              ) : (
                <Copy className="w-4 h-4 text-slate-600" />
              )}
            </button>
          </div>
        </div>

        {/* Text Area Display */}
        <div className="text-xs font-medium text-slate-800 leading-relaxed bg-white p-3 rounded-xl border border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.03)] select-all whitespace-pre-line font-sans min-h-[130px] flex flex-col justify-start items-start text-left w-full">
          {displayedReportText}
        </div>
      </div>
    </div>
  );
};
