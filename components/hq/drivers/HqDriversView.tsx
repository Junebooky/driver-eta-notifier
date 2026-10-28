'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { HqDriversTableView } from './HqDriversTableView';
import { HqDriverDetailSplitView } from './HqDriverDetailSplitView';
import { Plus, X, User, Phone, MapPin, Check } from 'lucide-react';
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

  const [viewMode, setViewMode] = useState<'table' | 'detail'>(() => {
    return urlView === 'detail' || Boolean(urlDriverId) ? 'detail' : 'table';
  });
  const [selectedDriverId, setSelectedDriverId] = useState<string>(() => {
    return urlDriverId || 'drv-kim';
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New Driver Form State
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAffiliation, setNewAffiliation] = useState<'employed' | 'freelance'>('employed');
  const [newResidence, setNewResidence] = useState('서울 (강남)');

  const handleSelectDriver = (driverId: string) => {
    setSelectedDriverId(driverId);
    setViewMode('detail');
  };

  const handleBackToTable = () => {
    haptics.lightTap();
    setViewMode('table');
  };

  return (
    <div className="space-y-4">
      {viewMode === 'table' ? (
        <HqDriversTableView
          onSelectDriver={handleSelectDriver}
          initialSearchQuery={initialSearchQuery}
          onOpenAddDriver={() => setIsAddModalOpen(true)}
        />
      ) : (
        <HqDriverDetailSplitView
          selectedDriverId={selectedDriverId}
          onSelectDriver={(id) => setSelectedDriverId(id)}
          onBackToTable={handleBackToTable}
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                haptics.success();
                setIsAddModalOpen(false);
                alert(`${newName || '신규'} 기사님이 정상적으로 등록되었습니다.`);
              }}
              className="p-5 space-y-4 text-xs font-bold text-slate-700"
            >
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#1E60F3] transition-all"
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
                  className="px-5 py-2 rounded-xl bg-[#1E60F3] hover:bg-blue-600 text-white text-xs font-black shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>기사 등록 완료</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
