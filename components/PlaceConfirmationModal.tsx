'use client';

import React, { useState, useEffect } from 'react';
import { X, MapPin, Search, CheckCircle2, Building, ShieldCheck, AlertCircle } from 'lucide-react';
import { PlaceCandidate, PlaceResolutionResult } from '@/services/placeResolutionService';
import { haptics } from '@/utils/haptics';

interface PlaceConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawQuery: string;
  onConfirm: (confirmedPlace: {
    name: string;
    road_address: string;
    lat: number;
    lng: number;
    entry_gate_notes?: string;
  }) => void;
}

export const PlaceConfirmationModal: React.FC<PlaceConfirmationModalProps> = ({
  isOpen,
  onClose,
  rawQuery,
  onConfirm,
}) => {
  const [query, setQuery] = useState(rawQuery);
  const [isLoading, setIsLoading] = useState(false);
  const [resolution, setResolution] = useState<PlaceResolutionResult | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<PlaceCandidate | null>(null);
  const [aliases, setAliases] = useState(rawQuery);
  const [entryGateNotes, setEntryGateNotes] = useState('');
  const [saveToMemory, setSaveToMemory] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && rawQuery) {
      setQuery(rawQuery);
      setAliases(rawQuery);
      handleResolve(rawQuery);
    }
  }, [isOpen, rawQuery]);

  const handleResolve = async (searchStr: string) => {
    if (!searchStr.trim()) return;
    setIsLoading(true);
    setSelectedCandidate(null);
    try {
      const res = await fetch(`/api/places/resolve?query=${encodeURIComponent(searchStr.trim())}`);
      const data: PlaceResolutionResult = await res.json();
      setResolution(data);

      if (data.status === 'verified' && data.place) {
        setSelectedCandidate({
          name: data.place.name,
          road_address: data.place.road_address,
          lat: data.place.lat,
          lng: data.place.lng,
          isVerified: true,
        });
        if (data.place.entry_gate_notes) {
          setEntryGateNotes(data.place.entry_gate_notes);
        }
      } else if (data.candidates && data.candidates.length > 0) {
        setSelectedCandidate(data.candidates[0]);
      }
    } catch (err) {
      console.error('Failed to resolve place query:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedCandidate) return;

    setIsSaving(true);
    haptics.heavyTap();

    try {
      if (saveToMemory && !selectedCandidate.isVerified) {
        // Save to organization memory
        const aliasList = aliases
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean);
        if (!aliasList.includes(query.trim())) {
          aliasList.push(query.trim());
        }

        await fetch('/api/places/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: selectedCandidate.name,
            aliases: aliasList,
            road_address: selectedCandidate.road_address,
            lat: selectedCandidate.lat,
            lng: selectedCandidate.lng,
            entry_gate_notes: entryGateNotes.trim() || undefined,
            verified_by: 'HQ_MANAGER',
          }),
        });
      }

      onConfirm({
        name: selectedCandidate.name,
        road_address: selectedCandidate.road_address,
        lat: selectedCandidate.lat,
        lng: selectedCandidate.lng,
        entry_gate_notes: entryGateNotes.trim() || undefined,
      });

      haptics.success();
      onClose();
    } catch (err) {
      console.error('Failed to confirm place:', err);
      haptics.errorAlert();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1E60F3] flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                위치 및 주소 확정 검증
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                의전 기사님 내비게이션 정확도 보장을 위한 장소 검증
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Query Search Bar */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">고객 요청 장소명</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleResolve(query)}
                  placeholder="장소명 또는 빌딩명 검색"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#1E60F3] focus:bg-white font-medium"
                />
              </div>
              <button
                type="button"
                onClick={() => handleResolve(query)}
                disabled={isLoading}
                className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? '검색 중...' : '재검색'}
              </button>
            </div>
          </div>

          {/* Verification Status Banner */}
          {resolution?.status === 'verified' && (
            <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-bold text-emerald-900">조직 메모리에 등록된 검증 장소입니다</p>
                <p className="text-emerald-700 mt-0.5">
                  사전에 확정된 좌표 및 의전 방문 지침이 자동으로 적용됩니다.
                </p>
              </div>
            </div>
          )}

          {resolution?.status === 'needs_confirmation' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-bold text-amber-900">미등록 장소 — 정확한 후보를 선택해 주세요</p>
                <p className="text-amber-700 mt-0.5">
                  아래 TMAP 검색 결과 중 기사님이 방문할 정확한 사업장 또는 정문을 지정하십시오.
                </p>
              </div>
            </div>
          )}

          {/* Candidates List */}
          {resolution?.candidates && resolution.candidates.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">
                TMAP 장소 후보 ({resolution.candidates.length}건)
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {resolution.candidates.map((cand, idx) => {
                  const isSelected = selectedCandidate?.road_address === cand.road_address;
                  return (
                    <div
                      key={`${cand.name}-${idx}`}
                      onClick={() => setSelectedCandidate(cand)}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        isSelected
                          ? 'border-[#1E60F3] bg-blue-50/50 shadow-xs ring-1 ring-[#1E60F3]'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <Building className="w-3.5 h-3.5 text-slate-500" />
                          {cand.name}
                        </span>
                        {cand.lowerBizName && (
                          <span className="text-[10px] text-slate-400 font-medium">
                            {cand.lowerBizName}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{cand.road_address}</span>
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Entry Gate / Protocol Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              현장 진입 안내 / 게이트 메모 (기사님 전달)
            </label>
            <input
              type="text"
              value={entryGateNotes}
              onChange={(e) => setEntryGateNotes(e.target.value)}
              placeholder="예: 정문 경비실에서 의전 차량 방문증 수령 후 VIP 승하차 구역 정차"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#1E60F3] focus:bg-white font-medium"
            />
          </div>

          {/* Save to Organization Memory Checkbox */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
              <input
                type="checkbox"
                checked={saveToMemory}
                onChange={(e) => setSaveToMemory(e.target.checked)}
                className="w-4 h-4 rounded text-[#1E60F3] focus:ring-[#1E60F3]"
              />
              <span>조직 장소 메모리에 저장 (차후 자동 인식)</span>
            </label>
            {saveToMemory && (
              <div className="space-y-1 pl-6">
                <span className="text-[11px] text-slate-500">인식할 별칭 (쉼표로 구분)</span>
                <input
                  type="text"
                  value={aliases}
                  onChange={(e) => setAliases(e.target.value)}
                  placeholder="예: 심텍, 심텍 본사, Simmtech"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#1E60F3]"
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedCandidate || isSaving}
            className="px-5 py-2.5 rounded-xl bg-[#1E60F3] hover:bg-[#1650D6] text-white text-xs font-extrabold shadow-sm shadow-blue-500/25 flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{isSaving ? '확정 저장 중...' : '위치 확정 및 배차 적용'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
