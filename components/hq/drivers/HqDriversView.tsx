'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { HqDriversTableView } from './HqDriversTableView';
import { HqDriverDetailSplitView } from './HqDriverDetailSplitView';
import { Plus, X, User, Phone, MapPin, Check, Loader2 } from 'lucide-react';
import { useHqDrivers } from '@/utils/useHqDrivers';
import { haptics } from '@/utils/haptics';

export interface HqDriversViewProps {
  initialSearchQuery?: string;
}

export const HqDriversView: React.FC<HqDriversViewProps> = ({
  initialSearchQuery = '',
}) => {
  const searchParams = useSearchParams();
  const urlDriverId = searchParams?.get('driverId');
  const urlView = searchParams?.get('view') as 'table' | 'detail' | null;

  const { drivers, counts, isLoading, error, updateDriver, createDriver } = useHqDrivers();

  const urlAdd = searchParams?.get('add') === 'true';

  const [viewMode, setViewMode] = useState<'table' | 'detail'>(() => {
    return urlView === 'detail' || Boolean(urlDriverId) ? 'detail' : 'table';
  });
  const [selectedDriverId, setSelectedDriverId] = useState<string>(() => {
    return urlDriverId || '';
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(urlAdd);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Default selectedDriverId when drivers load
  useEffect(() => {
    if (!selectedDriverId && drivers.length > 0) {
      setSelectedDriverId(drivers[0].id);
    }
  }, [drivers, selectedDriverId]);

  // Sync from URL params
  useEffect(() => {
    if (urlDriverId) {
      setSelectedDriverId(urlDriverId);
      setViewMode('detail');
    }
  }, [urlDriverId]);

  // New Driver Form State
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAffiliation, setNewAffiliation] = useState<'employed' | 'freelance'>('employed');
  const [newResidence, setNewResidence] = useState('서울 (강남)');
  const [isEnglish, setIsEnglish] = useState(false);

  const handleSelectDriver = (driverId: string) => {
    setSelectedDriverId(driverId);
    setViewMode('detail');
  };

  const handleBackToTable = () => {
    haptics.lightTap();
    setViewMode('table');
  };

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setIsSubmitting(true);
    try {
      const created = await createDriver({
        name: newName.trim(),
        phone: newPhone.trim(),
        affiliationType: newAffiliation,
        residence: newResidence.trim(),
        englishAvailable: isEnglish,
      });

      if (created) {
        haptics.success();
        setIsAddModalOpen(false);
        setNewName('');
        setNewPhone('');
        setIsEnglish(false);
        setSelectedDriverId(created.id);
        setViewMode('detail');
      } else {
        alert('기사 등록 중 오류가 발생했습니다.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {viewMode === 'table' ? (
        <HqDriversTableView
          onSelectDriver={handleSelectDriver}
          initialSearchQuery={initialSearchQuery}
          onOpenAddDriver={() => setIsAddModalOpen(true)}
          drivers={drivers}
          counts={counts}
          isLoading={isLoading}
        />
      ) : (
        <HqDriverDetailSplitView
          selectedDriverId={selectedDriverId || (drivers[0]?.id ?? '')}
          onSelectDriver={(id) => setSelectedDriverId(id)}
          onBackToTable={handleBackToTable}
          drivers={drivers}
          counts={counts}
          isLoading={isLoading}
          onUpdateDriver={updateDriver}
        />
      )}

      {/* Quick Add Driver Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1E60F3] flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-slate-900">신규 기사 등록</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateDriver} className="p-5 space-y-4 text-xs font-bold text-slate-700">
              <div>
                <label className="block text-slate-500 mb-1">기사명 *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="예: 홍길동"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#1E60F3] transition-all"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">연락처 *</label>
                <input
                  type="tel"
                  required
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="예: 010-1234-5678"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#1E60F3] transition-all font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 mb-1">소속 구분</label>
                  <select
                    value={newAffiliation}
                    onChange={(e) => setNewAffiliation(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#1E60F3] transition-all cursor-pointer"
                  >
                    <option value="employed">본사 소속</option>
                    <option value="freelance">프리랜서</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">거주 지역</label>
                  <input
                    type="text"
                    value={newResidence}
                    onChange={(e) => setNewResidence(e.target.value)}
                    placeholder="예: 서울 (강남)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#1E60F3] transition-all"
                  />
                </div>
              </div>

              {/* English Capability Toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="block text-xs font-bold text-slate-900">영어 소통 가능 여부</span>
                  <span className="text-[11px] text-slate-400 font-normal">외국인 VIP 의전 배차 시 우선 필터링</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEnglish(!isEnglish)}
                  className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${
                    isEnglish ? 'bg-[#1E60F3]' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      isEnglish ? 'left-5' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#1E60F3] hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-black shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>{isSubmitting ? '등록 중...' : '기사 등록 완료'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
