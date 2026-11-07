'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { HqDriversTableView } from './HqDriversTableView';
import { HqDriverDetailSplitView } from './HqDriverDetailSplitView';
import { Plus, X, User, Phone, MapPin, Check, Loader2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useHqDrivers } from '@/utils/useHqDrivers';
import { HqAdminLoginModal } from '@/components/hq/auth/HqAdminLoginModal';
import { haptics } from '@/utils/haptics';
import { formatPhoneNumber } from '@/utils/formatters';

export interface HqDriversViewProps {
  initialSearchQuery?: string;
}

export const HqDriversView: React.FC<HqDriversViewProps> = ({
  initialSearchQuery = '',
}) => {
  const searchParams = useSearchParams();
  const urlDriverId = searchParams?.get('driverId');
  const urlView = searchParams?.get('view') as 'table' | 'detail' | null;

  const { drivers, counts, isLoading, error, statusCode, refetch, updateDriver, deleteDriver, createDriver } = useHqDrivers();

  const urlAdd = searchParams?.get('add') === 'true';

  const [viewMode, setViewMode] = useState<'table' | 'detail'>(() => {
    return urlView === 'detail' || Boolean(urlDriverId) ? 'detail' : 'table';
  });
  const [selectedDriverId, setSelectedDriverId] = useState<string>(() => {
    return urlDriverId || '';
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(urlAdd);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [createError, setCreateError] = useState<{ message: string; statusCode?: number } | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    count: number;
    existing: Array<{
      id: string;
      name: string;
      phone: string;
      affiliation_type?: string;
      vehicle_id?: string | null;
      vehicle_number?: string | null;
      created_at?: string;
    }>;
  } | null>(null);

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

  const handleOpenAddModal = () => {
    setCreateError(null);
    setDuplicateInfo(null);
    setIsAddModalOpen(true);
  };

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
    setCreateError(null);
    setDuplicateInfo(null);
  };

  const handleCreateDriver = async (e?: React.FormEvent, allowDuplicate = false) => {
    if (e) e.preventDefault();
    if (!newName.trim()) return;

    setIsSubmitting(true);
    setCreateError(null);
    if (!allowDuplicate) {
      setDuplicateInfo(null);
    }

    try {
      const res = await createDriver(
        {
          name: newName.trim(),
          phone: newPhone.trim(),
          affiliationType: newAffiliation,
          residence: newResidence.trim(),
          englishAvailable: isEnglish,
        },
        allowDuplicate
      );

      if (res.ok && res.driver) {
        haptics.success();
        setIsAddModalOpen(false);
        setNewName('');
        setNewPhone('');
        setIsEnglish(false);
        setDuplicateInfo(null);
        setCreateError(null);
        setSelectedDriverId(res.driver.id);
        setViewMode('detail');
        return;
      }

      if (res.isDuplicate && res.existingDrivers) {
        haptics.warningPulse();
        setDuplicateInfo({
          count: res.duplicateCount || res.existingDrivers.length,
          existing: res.existingDrivers,
        });
        return;
      }

      // Other errors
      haptics.errorAlert();
      setCreateError({
        message: res.error || '기사 등록 중 오류가 발생했습니다.',
        statusCode: res.statusCode,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="hq-drivers-a space-y-5">
      {viewMode === 'table' ? (
        <HqDriversTableView
          onSelectDriver={handleSelectDriver}
          initialSearchQuery={initialSearchQuery}
          onOpenAddDriver={handleOpenAddModal}
          drivers={drivers}
          counts={counts}
          isLoading={isLoading}
          error={error}
          statusCode={statusCode}
          onRetry={refetch}
          onOpenLogin={() => setIsLoginModalOpen(true)}
          onUpdateDriver={updateDriver}
          onDeleteDriver={deleteDriver}
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
          onRefreshDrivers={refetch}
        />
      )}

      {/* Quick Add Driver Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#17233B]/30 p-3 backdrop-blur-[2px] sm:p-6 animate-in fade-in duration-150">
          <div className="hq-driver-form-a w-full max-w-md overflow-hidden rounded-[25px] bg-[#FAFBFD] shadow-[0_24px_64px_rgba(27,45,77,0.16),0_4px_14px_rgba(27,45,77,0.04)] animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between bg-white px-5 py-5">
              <div className="flex items-center gap-2">
                <div className="flex size-11 items-center justify-center rounded-[15px] bg-[#EEF3FF] text-[#1E60F3]">
                  <User className="w-4 h-4" />
                </div>
                <h3 className="text-[18px] font-bold tracking-[-0.03em] text-[#17233B]">신규 기사 등록</h3>
              </div>
              <button
                type="button"
                onClick={handleCloseAddModal}
                className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-[#F7F9FC] text-[#73839D] transition-colors hover:bg-[#EDF1F6]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={(e) => handleCreateDriver(e, false)} className="space-y-5 p-5 text-[12px] font-medium text-[#4D607C]">
              {/* Duplicate Driver Warning Card */}
              {duplicateInfo && (
                <div className="rounded-[17px] bg-[#FFF9F1] p-4 text-[#8E633F] space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-black text-xs text-amber-950">
                        동일 정보의 기사가 이미 {duplicateInfo.count}명 등록되어 있습니다
                      </div>
                      <div className="text-[11px] text-amber-800 font-medium mt-0.5">
                        기존 기사를 선택하거나, 동명이인/별도 계정이 확실한 경우에만 확인 후 등록하세요.
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {duplicateInfo.existing.map((ex) => (
                      <div
                        key={ex.id}
                        className="flex items-center justify-between rounded-[12px] bg-white p-3 text-[12px]"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span className="truncate">{ex.name}</span>
                            <span className="font-mono text-[10px] text-slate-400 shrink-0">({ex.id.slice(0, 8)}...)</span>
                            {ex.vehicle_number && (
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium shrink-0">
                                {ex.vehicle_number}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
                            {ex.phone} · {ex.affiliation_type === 'employed' ? '본사' : '프리'}
                            {ex.created_at && ` · ${new Date(ex.created_at).toLocaleDateString('ko-KR')}`}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            haptics.selection();
                            handleCloseAddModal();
                            handleSelectDriver(ex.id);
                          }}
                          className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] transition-colors cursor-pointer shrink-0"
                        >
                          선택
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-amber-200 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-amber-800 font-semibold leading-tight">
                      신규 동명이인으로 별도 추가:
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCreateDriver(undefined, true)}
                      disabled={isSubmitting}
                      className="min-h-10 shrink-0 cursor-pointer rounded-[13px] bg-white px-3 text-[11px] font-semibold text-[#8E633F] shadow-[0_3px_10px_rgba(35,49,78,0.06)] transition-colors hover:bg-[#FFF4E6] disabled:opacity-50"
                    >
                      동명이인 확인 후 등록
                    </button>
                  </div>
                </div>
              )}

              {/* Error Alert Card */}
              {createError && (
                <div className="rounded-[17px] bg-[#FFF4F2] p-4 text-[#A34E45] space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>등록 실패 {createError.statusCode ? `(HTTP ${createError.statusCode})` : ''}</span>
                  </div>
                  <p className="text-[11px] text-rose-700 leading-relaxed font-medium">
                    {createError.message}
                  </p>
                  {(createError.statusCode === 401 || createError.statusCode === 403) && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setIsLoginModalOpen(true)}
                        className="min-h-10 cursor-pointer rounded-[13px] bg-white px-3 text-[11px] font-semibold text-[#A34E45] shadow-[0_3px_10px_rgba(35,49,78,0.06)] transition-colors hover:bg-[#FFE9E5]"
                      >
                        본사 관리자(HQ) 인증 로그인하기
                      </button>
                    </div>
                  )}
                </div>
              )}

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
                  onChange={(e) => setNewPhone(formatPhoneNumber(e.target.value))}
                  placeholder="예: 010-1234-5678"
                  maxLength={13}
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
              <div className="flex items-center justify-between rounded-[16px] bg-white p-4 shadow-[0_4px_14px_rgba(35,49,78,0.045)]">
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

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={handleCloseAddModal}
                  className="min-h-11 cursor-pointer rounded-[14px] bg-[#F7F9FC] px-4 text-[12px] font-semibold text-[#4D607C] transition-colors hover:bg-[#EDF1F6]"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[14px] bg-[#1E60F3] px-5 text-[12px] font-semibold text-white shadow-[0_6px_16px_rgba(30,96,243,0.15)] transition-colors hover:bg-[#1757DC] disabled:opacity-50"
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

      {/* HQ Admin Authentication Login Modal */}
      <HqAdminLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={() => {
          setIsLoginModalOpen(false);
          setCreateError(null);
          refetch();
        }}
      />
    </div>
  );
};
