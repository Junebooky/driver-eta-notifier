'use client';

import React, { useState, useMemo, useSyncExternalStore } from 'react';
import {
  BarChart3,
  Building2,
  Calendar,
  Car,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Globe,
  Info,
  Lock,
  Printer,
  Receipt,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Users,
  AlertTriangle,
  X,
} from 'lucide-react';
import {
  CustomerContractTerms,
  EventSettlementReport,
  PricingTierSource,
  SettlementReportStatus,
  VatHandlingMode,
} from '@/types/settlementHq';
import {
  exportAdminProfitabilityCsv,
  exportClientSettlementCsv,
  getDriverProfilesSnapshot,
  getSettlementReportsServerSnapshot,
  getSettlementReportsSnapshot,
  getVehiclePresetsSnapshot,
  resetDemoPipelineData,
  runDemoPipelineScenario,
  saveDriverProfiles,
  saveVehiclePresets,
  subscribeSettlementReports,
  updateSettlementReportContractTerms,
  updateSettlementReportStatus,
} from '@/utils/settlementStorage';
import { formatKRW } from '@/utils/expense';
import { haptics } from '@/utils/haptics';

export interface HqReportsViewProps {
  initialSearchQuery?: string;
  initialCustomerId?: string;
}

export const HqReportsView: React.FC<HqReportsViewProps> = ({
  initialSearchQuery = '',
  initialCustomerId,
}) => {
  const reports = useSyncExternalStore(
    subscribeSettlementReports,
    getSettlementReportsSnapshot,
    getSettlementReportsServerSnapshot
  );

  const vehiclePresets = useSyncExternalStore(
    subscribeSettlementReports,
    getVehiclePresetsSnapshot,
    getVehiclePresetsSnapshot
  );

  const driverProfiles = useSyncExternalStore(
    subscribeSettlementReports,
    getDriverProfilesSnapshot,
    getDriverProfilesSnapshot
  );

  // Filters
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [statusFilter, setStatusFilter] = useState<'all' | SettlementReportStatus>('all');
  const [selectedReportId, setSelectedReportId] = useState<string>(
    () => {
      if (initialCustomerId) {
        const match = reports.find((r) => r.customerId === initialCustomerId);
        if (match) return match.id;
      }
      return reports[0]?.id || '';
    }
  );

  // View Mode: 'admin_internal' (본사 내부 정산·수익성 뷰) vs 'client_external' (고객사 전달용 리포트 뷰 - 내부원가/마진 완벽 제거)
  const [reportViewMode, setReportViewMode] = useState<'admin_internal' | 'client_external'>(
    'admin_internal'
  );

  // Modals
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [showDevConsole, setShowDevConsole] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [demoLogs, setDemoLogs] = useState<string[]>([]);
  const [confirmDirectCostsOnApprove, setConfirmDirectCostsOnApprove] = useState(false);

  // Contract Edit Form State
  const [editBaseHours, setEditBaseHours] = useState(10);
  const [editBaseRate, setEditBaseRate] = useState(800000);
  const [editOvertimeRate, setEditOvertimeRate] = useState(60000);
  const [editRoundingUnit, setEditRoundingUnit] = useState(30);
  const [editRoundingMethod, setEditRoundingMethod] = useState<'ceil' | 'round' | 'floor' | 'exact'>('ceil');
  const [editVatMode, setEditVatMode] = useState<VatHandlingMode>('unset');
  const [editPricingSource, setEditPricingSource] = useState<PricingTierSource>('customer_contract');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3200);
  };

  // Filtered reports
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          r.customerName.toLowerCase().includes(q) ||
          r.eventName.toLowerCase().includes(q) ||
          r.reportNo.toLowerCase().includes(q) ||
          (r.orderingAgency && r.orderingAgency.toLowerCase().includes(q)) ||
          r.vehicles.some(
            (v) =>
              v.driverName.toLowerCase().includes(q) ||
              v.vehicleModel.toLowerCase().includes(q) ||
              v.vehiclePlate.toLowerCase().includes(q)
          );
        if (!matches) return false;
      }
      return true;
    });
  }, [reports, statusFilter, searchQuery]);

  const selectedReport = useMemo(() => {
    return (
      reports.find((r) => r.id === selectedReportId) ||
      filteredReports[0] ||
      reports[0] ||
      null
    );
  }, [reports, filteredReports, selectedReportId]);

  // Dashboard Aggregate KPIs
  const dashboardKpis = useMemo(() => {
    const totalRevenue = reports.reduce((s, r) => s + r.supplyAmount, 0);
    const totalDriverLabor = reports.reduce((s, r) => s + r.totalDriverLaborCost, 0);
    const totalApprovedExpenses = reports.reduce((s, r) => s + r.totalApprovedExpenses, 0);
    const totalDirectProfit = reports.reduce((s, r) => s + r.totalDirectProfit, 0);
    const avgMargin =
      totalRevenue > 0 ? Number(((totalDirectProfit / totalRevenue) * 100).toFixed(1)) : 0;
    const totalOvertimeMin = reports.reduce((s, r) => s + r.totalOvertimeMinutes, 0);
    const totalOvertimeFare = reports.reduce((s, r) => s + r.totalOvertimeFare, 0);
    const approvedCount = reports.filter(
      (r) => r.status === 'approved' || r.status === 'invoiced'
    ).length;
    const pendingCount = reports.length - approvedCount;

    return {
      totalRevenue,
      totalDriverLabor,
      totalApprovedExpenses,
      totalDirectProfit,
      avgMargin,
      totalOvertimeMin,
      totalOvertimeFare,
      approvedCount,
      pendingCount,
    };
  }, [reports]);

  // Open contract editor for selected report
  const handleOpenContractModal = () => {
    if (!selectedReport) return;
    haptics.lightTap();
    const firstVeh = selectedReport.vehicles[0];
    setEditBaseHours(selectedReport.contractTerms?.baseHours || firstVeh?.baseContractHours || 10);
    setEditBaseRate(selectedReport.contractTerms?.baseRate || firstVeh?.baseFare || 800000);
    setEditOvertimeRate(selectedReport.contractTerms?.overtimeHourlyRate || 60000);
    setEditRoundingUnit(selectedReport.contractTerms?.roundingUnitMinutes || 30);
    setEditRoundingMethod(selectedReport.contractTerms?.roundingMethod || 'ceil');
    setEditVatMode(selectedReport.vatMode || 'unset');
    setEditPricingSource('customer_contract');
    setIsContractModalOpen(true);
  };

  // Save contract terms to report
  const handleSaveContractTerms = () => {
    if (!selectedReport) return;
    haptics.success();
    const terms: CustomerContractTerms = {
      baseHours: editBaseHours,
      baseRate: editBaseRate,
      overtimeHourlyRate: editOvertimeRate > 0 ? editOvertimeRate : undefined,
      roundingUnitMinutes: editRoundingUnit,
      roundingMethod: editRoundingMethod,
      vatMode: editVatMode,
      isTemporaryPreset: editPricingSource === 'preset',
      pricingSource: editPricingSource,
    };
    updateSettlementReportContractTerms(selectedReport.id, terms, editVatMode);
    setIsContractModalOpen(false);
    showToast(`${selectedReport.customerName} 행사 정산 요율 및 계약조건이 반영되었습니다.`);
  };

  // Download Client CSV (Strictly excludes driver labor & company profit!)
  const handleDownloadClientCsv = () => {
    if (!selectedReport) return;
    if (selectedReport.status !== 'approved' && selectedReport.status !== 'invoiced') {
      alert('관리자 검토·승인 완료 후 고객사 제출용 확정 정산서를 다운로드할 수 있습니다.');
      return;
    }
    haptics.selection();
    const csv = exportClientSettlementCsv(selectedReport);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `고객사제출용_운행정산서_${selectedReport.customerName}_${selectedReport.reportNo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('고객사 제출용 정산 명세서(내부 인건비/수익 제외) Excel(CSV) 다운로드가 완료되었습니다.');
  };

  // Download Admin Internal Profitability CSV
  const handleDownloadAdminCsv = () => {
    if (!selectedReport) return;
    haptics.selection();
    const csv = exportAdminProfitabilityCsv(selectedReport);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `[대외비_본사내부용]_수익성분석_${selectedReport.customerName}_${selectedReport.reportNo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('본사 내부용 배차별 수익성 분석 Excel(CSV) 다운로드가 완료되었습니다.');
  };

  // Print / PDF Export
  const handlePrintPdf = () => {
    if (!selectedReport) return;
    if (
      reportViewMode === 'client_external' &&
      selectedReport.status !== 'approved' &&
      selectedReport.status !== 'invoiced'
    ) {
      alert('관리자 검토·승인 완료 후 고객사 제출용 PDF/인쇄가 가능합니다.');
      return;
    }
    haptics.selection();
    window.print();
  };

  const getStatusBadge = (status: SettlementReportStatus) => {
    switch (status) {
      case 'approved':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>승인 완료</span>
          </span>
        );
      case 'invoiced':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-blue-50 text-[#0050FF] border border-blue-200 inline-flex items-center gap-1">
            <Receipt className="w-3 h-3" />
            <span>청구 완료</span>
          </span>
        );
      case 'reviewing':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>검토 중</span>
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-slate-100 text-slate-600 border border-slate-200 inline-flex items-center gap-1">
            <span>청구 대기</span>
          </span>
        );
    }
  };

  const getPricingSourceBadge = (source: PricingTierSource, isTemp: boolean) => {
    if (source === 'unregistered') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-700 border border-rose-200">
          요금 미등록 · 확인필요
        </span>
      );
    }
    if (isTemp || source === 'preset') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
          임시 단가 프리셋 (예상)
        </span>
      );
    }
    if (source === 'booking_override') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-700 border border-purple-200">
          개별 배차 확정단가
        </span>
      );
    }
    if (source === 'event_special') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-100 text-indigo-700 border border-indigo-200">
          행사 특별단가
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-700 border border-emerald-200">
        고객사 계약단가
      </span>
    );
  };

  return (
    <div className="space-y-4 select-none">
      {/* 1. Header Bar: Title + Simple Actions (Diet banner) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#0050FF] flex items-center justify-center font-bold shrink-0 shadow-2xs">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900">
                정산 · 통계 리포트
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                10시간 기준
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              고객사 운행 정산서 발행 및 배차별 손익 분석
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              setIsPresetModalOpen(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <Settings2 className="w-3.5 h-3.5 text-slate-500" />
            <span>기본 요금 및 인건비 설정</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDevConsole(!showDevConsole)}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              showDevConsole
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span>{showDevConsole ? '테스트 콘솔 닫기' : '테스트 콘솔'}</span>
          </button>
        </div>
      </div>

      {/* 1-B. End-to-End Pipeline Scenario Generator (Collapsed by Default, Isolated) */}
      {showDevConsole && (
        <div className="bg-slate-900 text-white rounded-2xl p-4 border border-slate-800 space-y-2.5 animate-in fade-in duration-150 print:hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-blue-600 text-white text-[10px] font-black tracking-wide">
                DEV TEST CONSOLE
              </span>
              <span className="text-xs font-black text-white">
                E2E 업무·정산 파이프라인 시나리오 실행기
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {(
                [
                  { code: 'A', label: '시나리오 A (단일차량)' },
                  { code: 'B', label: '시나리오 B (복수3대)' },
                  { code: 'C', label: '시나리오 C (수정·재계산)' },
                  { code: 'D', label: '시나리오 D (경계조건)' },
                  { code: 'ALL', label: '전체 A~D 실행' },
                ] as const
              ).map((btn) => (
                <button
                  key={btn.code}
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    const res = runDemoPipelineScenario(btn.code);
                    setDemoLogs(res.summaryLog);
                    const firstDemo = res.reports.find((r) => r.isDemoScenario);
                    if (firstDemo) setSelectedReportId(firstDemo.id);
                    showToast(`시나리오 ${btn.code} E2E 데이터 생성 및 정산 검증 완료`);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                    btn.code === 'ALL'
                      ? 'bg-[#0050FF] hover:bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                >
                  {btn.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  resetDemoPipelineData();
                  setDemoLogs([]);
                  showToast('DEMO 시나리오 데이터가 초기화되었습니다.');
                }}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800/70 cursor-pointer"
              >
                초기화
              </button>
            </div>
          </div>

          {demoLogs.length > 0 && (
            <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-[11px] text-emerald-300 font-mono space-y-1">
              {demoLogs.map((logLine, i) => (
                <div key={i}>✓ {logLine}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. Top 6 Settlement & Profitability KPI Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 print:hidden">
        {/* Tile 1: 총 매출 (공급가) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
            <span>총 매출 (공급가)</span>
            <Building2 className="w-4 h-4 text-[#0050FF]" />
          </div>
          <div className="text-lg sm:text-xl font-black text-slate-900 mt-2">
            {formatKRW(dashboardKpis.totalRevenue)}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            임시 단가 포함
          </div>
        </div>

        {/* Tile 2: 기사 인건비 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
            <span>기사 인건비</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-lg sm:text-xl font-black text-slate-900 mt-2">
            {formatKRW(dashboardKpis.totalDriverLabor)}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            총 {reports.reduce((acc, r) => acc + r.totalVehiclesCount, 0)}대 기준
          </div>
        </div>

        {/* Tile 3: 승인 실비 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
            <span>승인 실비</span>
            <Receipt className="w-4 h-4 text-emerald-600" />
          </div>
          <div
            className={`text-lg sm:text-xl mt-2 ${
              dashboardKpis.totalApprovedExpenses === 0
                ? 'text-slate-400 font-semibold'
                : 'font-black text-slate-900'
            }`}
          >
            {formatKRW(dashboardKpis.totalApprovedExpenses)}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            승인 완료분
          </div>
        </div>

        {/* Tile 4: 배차 직접이익 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
            <span>배차 직접이익</span>
            <TrendingUp className="w-4 h-4 text-[#0050FF]" />
          </div>
          <div className="text-lg sm:text-xl font-black text-[#0050FF] mt-2 flex items-baseline gap-1.5 flex-wrap">
            <span>{formatKRW(dashboardKpis.totalDirectProfit)}</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-black bg-blue-50 text-[#0050FF]">
              이익률 {dashboardKpis.avgMargin}%
            </span>
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            직접비 차감 기준
          </div>
        </div>

        {/* Tile 5: 초과 운행 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
            <span>초과 운행</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-lg sm:text-xl font-black text-slate-900 mt-2">
            {Math.floor(dashboardKpis.totalOvertimeMin / 60)}시간 {dashboardKpis.totalOvertimeMin % 60}분
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            서비스 초과분
          </div>
        </div>

        {/* Tile 6: 정산 현황 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
            <span>정산 현황</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-lg sm:text-xl font-black text-slate-900 mt-2">
            승인 {dashboardKpis.approvedCount}건 · 대기 {dashboardKpis.pendingCount}건
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            전체 {reports.length}건 중
          </div>
        </div>
      </div>

      {/* 2-B. Reference-Style Mini Analytics: 수익성 추이 & 비용 구성 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 print:hidden">
        {/* 수익성 추이 (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">수익성 추이</h3>
            <span className="text-xs font-semibold text-slate-400">최근 7일 정산</span>
          </div>

          <div className="h-44 w-full flex flex-col justify-end relative pt-6">
            {/* Pill Tooltip */}
            <div className="absolute right-4 top-2 bg-[#0050FF] text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-md shadow-blue-500/25 flex items-center gap-1">
              <span>{formatKRW(dashboardKpis.totalDirectProfit)}</span>
            </div>

            {/* SVG Curve Area */}
            <svg
              className="w-full h-32 overflow-visible"
              viewBox="0 0 500 120"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0050FF" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#0050FF" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {/* Horizontal grid lines */}
              <line x1="0" y1="20" x2="500" y2="20" stroke="#F1F5F9" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="0" y1="60" x2="500" y2="60" stroke="#F1F5F9" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="0" y1="100" x2="500" y2="100" stroke="#F1F5F9" strokeWidth="1" strokeDasharray="3 3" />

              {/* Area */}
              <path
                d="M 15 105 C 80 100, 140 70, 200 90 C 260 110, 320 60, 380 75 C 430 85, 460 30, 485 28 L 485 118 L 15 118 Z"
                fill="url(#profitGrad)"
              />
              {/* Smooth line */}
              <path
                d="M 15 105 C 80 100, 140 70, 200 90 C 260 110, 320 60, 380 75 C 430 85, 460 30, 485 28"
                fill="none"
                stroke="#0050FF"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* End Point Dot */}
              <circle cx="485" cy="28" r="4.5" fill="#FFFFFF" stroke="#0050FF" strokeWidth="2.5" />
            </svg>

            {/* X-axis date labels */}
            <div className="flex justify-between text-[11px] font-semibold text-slate-400 pt-2 border-t border-slate-100">
              <span>10/29</span>
              <span>10/30</span>
              <span>10/31</span>
              <span>11/01</span>
              <span>11/02</span>
              <span>11/03</span>
              <span className="font-bold text-[#0050FF]">11/04</span>
            </div>
          </div>
        </div>

        {/* 비용 구성 (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">비용 구성</h3>
            <span className="text-xs font-semibold text-slate-400">매출 대비 비중</span>
          </div>

          <div className="flex items-center justify-around gap-4 py-2 my-auto">
            {/* Donut Chart */}
            <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                {/* Background Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="transparent"
                  stroke="#F1F5F9"
                  strokeWidth="12"
                />
                {/* Labor Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="transparent"
                  stroke="#93C5FD"
                  strokeWidth="12"
                  strokeDasharray="238.76"
                  strokeDashoffset={238.76 * (1 - 0.99)}
                />
                {/* Direct Profit Ring (Main) */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="transparent"
                  stroke="#0050FF"
                  strokeWidth="12"
                  strokeDasharray="238.76"
                  strokeDashoffset={238.76 * (1 - Math.min(Math.max(dashboardKpis.avgMargin / 100, 0), 1))}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[10px] text-slate-400 font-bold">수익률</span>
                <span className="text-base font-black text-slate-900 leading-tight">
                  {dashboardKpis.avgMargin}%
                </span>
              </div>
            </div>

            {/* Legend List */}
            <div className="space-y-2.5 text-xs min-w-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0050FF] shrink-0" />
                <div className="min-w-0">
                  <span className="text-slate-500 font-medium block text-[11px]">직접이익</span>
                  <span className="font-extrabold text-slate-900 truncate block">
                    {formatKRW(dashboardKpis.totalDirectProfit)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-300 shrink-0" />
                <div className="min-w-0">
                  <span className="text-slate-500 font-medium block text-[11px]">기사 인건비</span>
                  <span className="font-extrabold text-slate-900 truncate block">
                    {formatKRW(dashboardKpis.totalDriverLabor)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-200 shrink-0" />
                <div className="min-w-0">
                  <span className="text-slate-500 font-medium block text-[11px]">기타 비용</span>
                  <span className="font-extrabold text-slate-900 truncate block">
                    {formatKRW(dashboardKpis.totalApprovedExpenses)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 text-center pt-1 border-t border-slate-100">
            총 공급가액 기준 정산 집계
          </div>
        </div>
      </div>

      {/* 3. Main Split Grid: Left Event List (4 cols) + Right Comprehensive Report & Profit Analysis (8 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left 4 Cols: 행사별 정산 목록 */}
        <div className="xl:col-span-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-3.5 print:hidden">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">행사별 정산 리포트 목록</h3>
            <span className="text-xs font-bold text-slate-400">{filteredReports.length}건</span>
          </div>

          {/* Search & Status Tabs */}
          <div className="space-y-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="고객사, 행사명, 대행사, 기사명, 차량 검색..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {(
                [
                  { id: 'all', label: '전체' },
                  { id: 'draft', label: '청구 대기' },
                  { id: 'reviewing', label: '검토 중' },
                  { id: 'approved', label: '승인 완료' },
                  { id: 'invoiced', label: '청구 완료' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer transition-colors ${
                    statusFilter === tab.id
                      ? 'bg-[#0050FF] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Report Cards List (Compact 3-Row Hierarchy) */}
          <div className="space-y-2.5 max-h-[680px] overflow-y-auto pr-1">
            {filteredReports.map((rep) => {
              const isSelected = selectedReport?.id === rep.id;
              const formattedDate = rep.eventDate.replace(/-/g, '. ');
              const title = rep.eventName.startsWith(rep.customerName)
                ? rep.eventName
                : `${rep.customerName} ${rep.eventName}`;

              return (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    setSelectedReportId(rep.id);
                  }}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/60 border-[#0050FF] ring-1 ring-[#0050FF]/25 shadow-xs'
                      : 'bg-white hover:bg-slate-50 border-slate-200/80'
                  }`}
                >
                  {/* 1행: 행사명 (볼드) */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                      {title}
                    </span>
                  </div>

                  {/* 2행: 날짜 · 차량 1대 | 상태 뱃지 */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                    <span>
                      {formattedDate} · 차량 {rep.totalVehiclesCount}대
                    </span>
                    {getStatusBadge(rep.status)}
                  </div>

                  {/* 3행: 메인 금액 + 우측 이익 (라벨 제거) */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between mt-2">
                    <span className="font-extrabold text-slate-900 text-sm">
                      {rep.supplyAmount > 0 ? formatKRW(rep.grandTotal) : '요금 미등록'}
                    </span>
                    <span className="text-xs font-bold text-slate-400">
                      이익 {formatKRW(rep.totalDirectProfit)} ({rep.averageDirectMarginPercent}%)
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right 8 Cols: Selected Event Comprehensive Report & Profitability Inspector */}
        <div className="xl:col-span-8 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 lg:p-6 space-y-5">
          {selectedReport ? (
            <>
              {/* Top Mode Switcher: 관리자 내부 수익성 뷰 vs 고객사 제출용 리포트 뷰 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 print:hidden">
                <div className="inline-flex bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      haptics.selection();
                      setReportViewMode('admin_internal');
                    }}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                      reportViewMode === 'admin_internal'
                        ? 'bg-[#0050FF] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>내부 정산서</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      haptics.selection();
                      setReportViewMode('client_external');
                    }}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                      reportViewMode === 'client_external'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>고객사 제출용</span>
                  </button>
                </div>

                {/* Export & Contract Action Buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  {reportViewMode === 'admin_internal' && (
                    <>
                      <button
                        type="button"
                        onClick={handleOpenContractModal}
                        className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Settings2 className="w-3.5 h-3.5 text-[#0050FF]" />
                        <span>계약·요율 설정</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadAdminCsv}
                        className="group px-3 py-2 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-[#0050FF] text-xs font-bold flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                      >
                        <img
                          src="/images/icons/icon_excel.png"
                          alt="Excel"
                          className="w-4 h-4 object-contain shrink-0 transition-transform duration-150 group-hover:scale-110"
                        />
                        <span>내부 수익성 Excel</span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={handleDownloadClientCsv}
                    className="group px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                  >
                    <img
                      src="/images/icons/icon_excel.png"
                      alt="Excel"
                      className="w-4 h-4 object-contain shrink-0 transition-transform duration-150 group-hover:scale-110"
                    />
                    <span>고객사 제출용 Excel</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrintPdf}
                    className="px-3.5 py-2 rounded-xl bg-[#0050FF] hover:bg-blue-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>PDF / 인쇄</span>
                  </button>
                </div>
              </div>

              {/* Client View Security Banner */}
              {reportViewMode === 'client_external' && (
                <div className="p-3 rounded-xl bg-emerald-50/90 border border-emerald-200 flex items-center justify-between gap-3 text-xs text-emerald-900 print:hidden">
                  <div className="flex items-center gap-2 font-bold">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      [고객사 제출용 클린 모드] 기사 내부 인건비, 회사 마진, 직접이익 및 수익률 등 내부 경영정보가 완벽히 제외되었습니다.
                    </span>
                  </div>
                  {selectedReport.status !== 'approved' && selectedReport.status !== 'invoiced' && (
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-black shrink-0">
                      관리자 승인 전 (외부 발송 제한)
                    </span>
                  )}
                </div>
              )}

              {/* Header: Customer, Agency, End Brand, Event & Billing Target */}
              <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[#0050FF]">{selectedReport.reportNo}</span>
                      {getStatusBadge(selectedReport.status)}
                      {reportViewMode === 'admin_internal' && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-bold border border-slate-200">
                          대외비 (Internal Only)
                        </span>
                      )}
                      {reportViewMode === 'admin_internal' &&
                        getPricingSourceBadge(
                          selectedReport.pricingSource,
                          selectedReport.isTemporaryPreset
                        )}
                    </div>
                    <h3 className="text-base sm:text-lg font-black text-slate-900 mt-1">
                      {selectedReport.eventName}
                    </h3>
                  </div>

                  <div className="text-left sm:text-right">
                    <div className="text-[11px] text-slate-400 font-semibold">최종 청구 금액</div>
                    <div className="text-xl font-black text-[#0050FF]">
                      {selectedReport.supplyAmount > 0
                        ? formatKRW(selectedReport.grandTotal)
                        : '단가 확인 필요'}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      {selectedReport.vatMode === 'excluded'
                        ? `공급가 ${formatKRW(selectedReport.supplyAmount)} + 부가세 10%`
                        : selectedReport.vatMode === 'included'
                        ? '부가세(VAT) 포함 기준'
                        : '부가세(VAT) 포함 여부 미확정 (별도 설정)'}
                    </div>
                  </div>
                </div>

                {/* 4-Column Metadata: 발주 고객사 | 최종 브랜드 | 실제 청구처 | 행사 일자·장소 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-slate-200/70 text-xs">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/60">
                    <span className="text-[10px] text-slate-400 font-bold block">
                      발주 고객사 (대행사)
                    </span>
                    <span className="font-black text-slate-800 mt-0.5 block">
                      {selectedReport.orderingAgency || `${selectedReport.customerName} (직접 발주)`}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/60">
                    <span className="text-[10px] text-slate-400 font-bold block">최종 브랜드</span>
                    <span className="font-black text-slate-800 mt-0.5 block">
                      {selectedReport.endBrand}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/60">
                    <span className="text-[10px] text-slate-400 font-bold block">실제 청구 대상</span>
                    <span className="font-black text-[#0050FF] mt-0.5 block">
                      {selectedReport.billingTargetName}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/60">
                    <span className="text-[10px] text-slate-400 font-bold block">행사 일자 · 장소</span>
                    <span className="font-bold text-slate-800 mt-0.5 block truncate">
                      {selectedReport.eventDate} · {selectedReport.location}
                    </span>
                  </div>
                </div>
              </div>

              {/* Contract / Temporary Preset Warning Banner (Compressed 1-Line) */}
              {selectedReport.contractWarning && reportViewMode === 'admin_internal' && (
                <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 flex items-center justify-between gap-3 text-xs text-amber-900">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="font-bold truncate">
                      운행 시간 확인이 필요한 차량이 있어요 (임시 요금 프리셋 적용 중)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenContractModal}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    계약 단가 입력 ↗
                  </button>
                </div>
              )}

              {/* Section: 차량별 서비스 시간 · 요금 · (내부 인건비/수익) 상세 테이블 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                    <Car className="w-4 h-4 text-[#1E60F3]" />
                    <span>
                      투입 차량 및 고객사 서비스 시간 정산 ({selectedReport.totalVehiclesCount}대)
                    </span>
                  </h4>
                  <span className="text-[11px] font-bold text-slate-500">
                    ※ 차고지 차량 픽업 및 사전 이동시간은 고객사 청구시간에서 제외됨
                  </span>
                </div>

                <div className="space-y-3">
                  {selectedReport.vehicles.map((v) => (
                    <div
                      key={`${selectedReport.id}-veh-${v.vehicleIndex}`}
                      className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-3 shadow-2xs"
                    >
                      {/* Vehicle Top Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-lg bg-[#1E60F3] text-white text-xs font-black">
                            {v.vehicleIndex}호차
                          </span>
                          <span className="text-sm font-black text-slate-900">
                            {v.vehicleModel}
                          </span>
                          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            {v.vehiclePlate}
                          </span>
                          <span className="text-xs font-bold text-slate-700">
                            · 담당: {v.driverName}
                          </span>
                          {!v.isServiceTimeVerified && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                              운행일지 미제출
                            </span>
                          )}
                          {v.languageMismatchWarning && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              언어 확인 필요
                            </span>
                          )}
                          {v.serviceMode === 'with_driver' && (
                            <span
                              className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                                v.driverIsEnglishVerified
                                  ? 'bg-blue-50 text-[#0050FF] border-blue-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                            >
                              {v.driverIsEnglishVerified ? '영어 가능 (검증됨)' : '한국어 서비스'}
                            </span>
                          )}
                          {v.serviceMode === 'vehicle_only' && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-800 text-white">
                              차량만 대여 (기사 미포함)
                            </span>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 font-bold block">
                            차량 청구 소계 (인건비 이중청구 없음)
                          </span>
                          <span className="text-sm font-black text-slate-900">
                            {v.hasContractTerms ? formatKRW(v.vehicleFareSubtotal) : '요금 미등록'}
                          </span>
                        </div>
                      </div>

                      {/* Time Comparison Grid: 차고지 픽업(제외) vs 고객사 서비스 시간(청구 기준) */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                        {reportViewMode === 'admin_internal' && (
                          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
                            <span className="text-[10px] text-slate-400 font-bold block">
                              차고지 픽업·복귀 (청구제외)
                            </span>
                            <span className="font-bold text-slate-600 mt-0.5 block">
                              {v.garageDepartureTime} / {v.garageArrivalTime}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              법정근로: {v.totalDutyFormatted}
                            </span>
                          </div>
                        )}

                        <div
                          className={`p-2.5 rounded-xl border ${
                            v.isServiceTimeVerified
                              ? 'bg-blue-50/60 border-blue-200/80'
                              : 'bg-rose-50/80 border-rose-300'
                          }`}
                        >
                          <span
                            className={`text-[10px] font-bold block ${
                              v.isServiceTimeVerified ? 'text-[#1E60F3]' : 'text-rose-700'
                            }`}
                          >
                            고객사 서비스 시작~종료
                          </span>
                          <span className="font-black text-slate-900 mt-0.5 block">
                            {v.customerServiceStart} ~ {v.customerServiceEnd}
                          </span>
                          <span
                            className={`text-[10px] font-semibold ${
                              v.isServiceTimeVerified ? 'text-blue-700' : 'text-rose-700'
                            }`}
                          >
                            {v.isServiceTimeVerified ? '정산 기준 시간' : '서비스 시간 확인 필요'}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-white border border-slate-200/80">
                          <span className="text-[10px] text-slate-400 font-bold block">
                            총 서비스 시간 (기본 {v.baseContractHours}h)
                          </span>
                          <span
                            className={`font-black mt-0.5 block ${
                              v.isServiceTimeVerified ? 'text-slate-900' : 'text-rose-600'
                            }`}
                          >
                            {v.customerServiceFormatted}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            초과: {v.overtimeFormatted}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-white border border-slate-200/80">
                          <span className="text-[10px] text-slate-400 font-bold block">
                            기본 차량 요금 ({v.serviceMode === 'vehicle_only' ? '차량만' : '기사포함'})
                          </span>
                          <span className="font-black text-slate-900 mt-0.5 block">
                            {v.hasContractTerms ? formatKRW(v.baseFare) : '미등록'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {v.isTemporaryPreset ? '임시 10h 프리셋' : '계약 단가'}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-white border border-slate-200/80">
                          <span className="text-[10px] text-slate-400 font-bold block">
                            초과시간 요금
                          </span>
                          <span className="font-black text-slate-900 mt-0.5 block">
                            {!v.isServiceTimeVerified
                              ? '시간 확인 필요'
                              : v.overtimeMinutes === 0
                              ? '₩0 (초과 없음)'
                              : v.isOvertimeRateConfirmed
                              ? formatKRW(v.overtimeFare)
                              : '요율 미정(확인필요)'}
                          </span>
                          <span className="text-[10px] text-slate-400 truncate block">
                            {v.billedOvertimeFormatted}
                          </span>
                        </div>
                      </div>

                      {/* Admin Internal Only: Toss-Style Hierarchical List */}
                      {reportViewMode === 'admin_internal' && (
                        <div className="p-3.5 rounded-xl bg-slate-900 text-white grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold block">
                              차량 요금
                            </span>
                            <span className="font-black text-white text-sm mt-0.5 block">
                              {formatKRW(v.clientTotalRevenue)}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 font-bold block">
                              기사 인건비
                            </span>
                            <span className="font-black text-rose-400 text-sm mt-0.5 block">
                              -{formatKRW(v.driverLaborCost)}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 font-bold block">
                              직접 경비
                            </span>
                            <span className="font-black text-slate-300 text-sm mt-0.5 block">
                              -{formatKRW(v.vehicleDirectCost + v.otherDirectCost)}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] text-blue-300 font-bold block">
                              배차 직접이익
                            </span>
                            <span className="font-black text-emerald-400 text-sm mt-0.5 block">
                              {formatKRW(v.directProfit)}{' '}
                              <span className="text-xs font-bold text-emerald-300">
                                ({v.directMarginPercent}%)
                              </span>
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Notices (Clean formatting without repetitive warning icons) */}
                      {(v.notes ||
                        (reportViewMode === 'admin_internal' &&
                          (v.englishSurchargeNotice || v.driverOvertimeLaborWarning))) && (
                        <div className="text-[11px] text-slate-600 space-y-1 pt-1">
                          {v.notes && (
                            <p className="font-medium text-slate-700">
                              • <strong>운행 특이사항:</strong> {v.notes}
                            </p>
                          )}
                          {reportViewMode === 'admin_internal' && v.englishSurchargeNotice && (
                            <p className="text-blue-700 font-semibold">
                              • {v.englishSurchargeNotice}
                            </p>
                          )}
                          {reportViewMode === 'admin_internal' && v.driverOvertimeLaborWarning && (
                            <p className="text-amber-700 font-semibold">
                              • {v.driverOvertimeLaborWarning}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Section: 승인된 경비지출 및 영수증 내역 */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-[#1E60F3]" />
                    <span>승인된 실비 경비 및 영수증 증빙 내역</span>
                  </h4>
                  <span className="text-xs font-bold text-[#1E60F3]">
                    승인 실비 합계: {formatKRW(selectedReport.totalApprovedExpenses)}
                  </span>
                </div>

                {selectedReport.vehicles.flatMap((v) => v.expenses).length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-bold text-slate-500">
                          <th className="py-2.5 px-3">차량 / 기사</th>
                          <th className="py-2.5 px-3">일자</th>
                          <th className="py-2.5 px-3">구분</th>
                          <th className="py-2.5 px-3">가맹점</th>
                          <th className="py-2.5 px-3">청구 구분</th>
                          <th className="py-2.5 px-3">검수 상태</th>
                          <th className="py-2.5 px-3 text-right">금액</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedReport.vehicles.flatMap((v) =>
                          v.expenses
                            .filter((e) =>
                              reportViewMode === 'client_external'
                                ? e.status === '승인 완료' && e.billableToCustomer !== false
                                : true
                            )
                            .map((exp) => (
                              <tr key={exp.id} className="hover:bg-slate-50/70">
                                <td className="py-2.5 px-3 font-bold text-slate-800">
                                  {v.vehicleIndex}호차 ({v.driverName})
                                </td>
                                <td className="py-2.5 px-3 text-slate-500">{exp.submittedDate}</td>
                                <td className="py-2.5 px-3 font-bold text-slate-700">
                                  {exp.categoryLabel}
                                </td>
                                <td className="py-2.5 px-3 text-slate-800 font-semibold">
                                  {exp.merchant}
                                </td>
                                <td className="py-2.5 px-3">
                                  {exp.billableToCustomer !== false ? (
                                    <span className="px-2 py-0.5 rounded bg-blue-50 text-[#1E60F3] text-[10px] font-bold">
                                      고객사 실비 청구
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">
                                      회사 부담 직접비
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      exp.status === '승인 완료'
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : exp.status === '반려'
                                        ? 'bg-rose-50 text-rose-700'
                                        : 'bg-amber-50 text-amber-700'
                                    }`}
                                  >
                                    {exp.status}
                                    {exp.status !== '승인 완료' && ' (청구제외)'}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right font-black text-slate-900">
                                  {formatKRW(exp.amount)}
                                </td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 text-center text-xs text-slate-400 font-medium">
                    이 행사에 등록된 추가 실비 영수증이 없습니다.
                  </div>
                )}
              </div>

              {/* Financial Summary & Direct Profit Accounting Notice */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                {/* Left: Client Billing Summary (Shown in both modes) */}
                <div className="bg-slate-50/90 rounded-2xl p-4 border border-slate-200/80 space-y-2 text-xs">
                  <h5 className="font-black text-slate-900 text-xs pb-2 border-b border-slate-200">
                    고객사 청구 금액 합계 명세
                  </h5>
                  <div className="flex justify-between text-slate-600">
                    <span>기본 차량 요금 합계 ({selectedReport.totalVehiclesCount}대)</span>
                    <span className="font-bold text-slate-900">
                      {formatKRW(selectedReport.totalBaseFare)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>초과 서비스 요금 합계 ({selectedReport.totalOvertimeHoursFormatted})</span>
                    <span className="font-bold text-slate-900">
                      {formatKRW(selectedReport.totalOvertimeFare)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>관리자 승인 완료 실비 경비</span>
                    <span className="font-bold text-slate-900">
                      {formatKRW(selectedReport.totalApprovedExpenses)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-800 pt-2 border-t border-slate-200 font-bold">
                    <span>공급가액 소계</span>
                    <span>{formatKRW(selectedReport.supplyAmount)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>부가세 (VAT)</span>
                    <span>
                      {selectedReport.vatMode === 'excluded'
                        ? formatKRW(selectedReport.vatAmount)
                        : selectedReport.vatMode === 'included'
                        ? '공급가에 포함됨'
                        : '별도 확인 (미포함)'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-black text-[#1E60F3] pt-2 border-t border-slate-200">
                    <span>최종 청구 합계</span>
                    <span>{formatKRW(selectedReport.grandTotal)}</span>
                  </div>
                </div>

                {/* Right: Internal Profitability Summary (Toss-Style Clean Breakdown) */}
                {reportViewMode === 'admin_internal' ? (
                  <div className="bg-blue-50/40 rounded-2xl p-4 border border-blue-200/80 space-y-2 text-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-blue-200/60">
                      <h5 className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-[#0050FF]" />
                        <span>내부 정산 손익 명세</span>
                      </h5>
                      <span className="px-2 py-0.5 rounded bg-white text-[#0050FF] font-bold text-[10px] border border-blue-200">
                        {selectedReport.profitConfirmStatus === 'confirmed'
                          ? '확정 직접이익'
                          : '잠정 손익'}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>차량 요금 (공급가)</span>
                      <span className="font-bold text-slate-900">
                        {formatKRW(selectedReport.supplyAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>기사 인건비</span>
                      <span className="font-bold text-rose-600">
                        -{formatKRW(selectedReport.totalDriverLaborCost)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>직접 경비</span>
                      <span className="font-bold text-rose-600">
                        -{formatKRW(selectedReport.totalVehicleDirectCost + selectedReport.totalOtherDirectCost)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm font-black text-[#0050FF] pt-2 border-t border-blue-200/70">
                      <span>배차 직접이익</span>
                      <span>
                        {formatKRW(selectedReport.totalDirectProfit)} ({selectedReport.averageDirectMarginPercent}%)
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 flex flex-col justify-between text-xs">
                    <div className="space-y-1.5">
                      <h5 className="font-black text-slate-900 text-xs">
                        운행 및 정산 기준 안내
                      </h5>
                      <p className="text-slate-600 leading-relaxed text-[11px]">
                        1. 본 정산서의 서비스 시간은 실제 고객사 서비스 시작 시각부터 종료 시각까지를 기준으로 산정되었습니다. (차고지 출발 및 복귀 시간 제외)
                      </p>
                      <p className="text-slate-600 leading-relaxed text-[11px]">
                        2. 실시간 공유된 카카오톡 ETA(예상 도착시간)는 교통상황 기반 예측치이며 실제 정산 시간은 운행 완료 기록을 기준으로 합니다.
                      </p>
                    </div>
                    <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-bold">
                      <span>VIP LIMOUSINE KOREA 정산관리팀</span>
                      <span>
                        {selectedReport.approvedAt
                          ? `승인일시: ${selectedReport.approvedAt}`
                          : '검토 진행 중'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Admin Approval Workflow Footer (Print Hidden) */}
              <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 print:hidden">
                <div className="text-xs text-slate-500 font-medium flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-[#1E60F3] shrink-0" />
                    <span>
                      관리자 검토·승인 완료 후에만 실제 청구서로 확정 및 고객사 외부 발송이 가능합니다.
                    </span>
                  </div>
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmDirectCostsOnApprove}
                      onChange={(e) => setConfirmDirectCostsOnApprove(e.target.checked)}
                      className="rounded border-slate-300 text-[#1E60F3]"
                    />
                    <span>
                      기사 인건비 및 차량 직접원가 최종 확정 확인 (미체크 또는 미확정 항목 존재 시 &apos;잠정 손익&apos; 유지)
                    </span>
                  </label>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      haptics.lightTap();
                      updateSettlementReportStatus(selectedReport.id, 'reviewing');
                      showToast('정산 리포트가 검토 중 상태로 전환되었습니다.');
                    }}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    검토 중으로 변경
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      haptics.successPulse();
                      updateSettlementReportStatus(
                        selectedReport.id,
                        'approved',
                        undefined,
                        confirmDirectCostsOnApprove
                      );
                      showToast('정산 리포트 검토 및 승인이 완료되어 고객사 청구서 발행이 활성화되었습니다.');
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>검토 완료 및 청구 승인</span>
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Modal 1: 기본 요금 프리셋 & 기사 인건비 관리 모달 */}
      {isPresetModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  기본 임시 요금 프리셋 및 기사 인건비 설정 (10시간 기준)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  실제 계약 단가 확보 전 사용하는 수정 가능한 임시 요금표입니다. 기사 포함 요금에 기사 인건비를 이중 가산하지 않습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPresetModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Part A: 차종별 임시 요금 프리셋 (10시간 기본) */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <Car className="w-4 h-4 text-[#1E60F3]" />
                <span>1. 차종별 고객사 청구 임시 요금 프리셋 (기본 10시간 기준, 단위: 원)</span>
              </h4>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                      <th className="py-2.5 px-3">차량 모델 (제조사 제외)</th>
                      <th className="py-2.5 px-3">차급 분류</th>
                      <th className="py-2.5 px-3">차량만 대여 (10h)</th>
                      <th className="py-2.5 px-3">기사 포함 청구 (10h)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vehiclePresets.map((preset, idx) => (
                      <tr key={preset.presetKey}>
                        <td className="py-2 px-3 font-black text-slate-900">
                          {preset.displayName}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              preset.vehicleTier === 'sprinter'
                                ? 'bg-blue-50 text-[#1E60F3]'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {preset.vehicleTier === 'sprinter' ? '스프린터급' : '일반 의전차량'}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            step={10000}
                            value={preset.vehicleOnlyRate}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 0;
                              const next = vehiclePresets.map((p, i) =>
                                i === idx ? { ...p, vehicleOnlyRate: val } : p
                              );
                              saveVehiclePresets(next);
                            }}
                            className="w-32 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            step={10000}
                            value={preset.withDriverRate}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 0;
                              const next = vehiclePresets.map((p, i) =>
                                i === idx ? { ...p, withDriverRate: val } : p
                              );
                              saveVehiclePresets(next);
                            }}
                            className="w-32 px-2.5 py-1 bg-blue-50/50 border border-blue-200 rounded-lg font-black text-[#1E60F3]"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Part B: 기사별 서비스 가능 언어 및 인건비 지급 기준 */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#1E60F3]" />
                <span>
                  2. 기사별 언어 자격 및 10시간 기본 인건비 (스프린터: 한 15만/영 20만 · 일반차량: 한 10만/영 15만)
                </span>
              </h4>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                      <th className="py-2.5 px-3">기사명</th>
                      <th className="py-2.5 px-3">담당 차량</th>
                      <th className="py-2.5 px-3">영어 서비스 가능 검증</th>
                      <th className="py-2.5 px-3">기본 적용 인건비 (10h)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {driverProfiles.map((drv, idx) => {
                      const defaultPay = drv.isEnglishVerified
                        ? drv.baseLaborRateEn10h
                        : drv.baseLaborRateKo10h;
                      return (
                        <tr key={drv.id}>
                          <td className="py-2 px-3 font-black text-slate-900">{drv.name} 기사</td>
                          <td className="py-2 px-3 text-slate-600 font-medium">
                            {drv.defaultVehicleRaw} ({drv.plate})
                          </td>
                          <td className="py-2 px-3">
                            <label className="inline-flex items-center gap-1.5 cursor-pointer font-bold">
                              <input
                                type="checkbox"
                                checked={drv.isEnglishVerified}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  const next = driverProfiles.map((d, i) =>
                                    i === idx
                                      ? {
                                          ...d,
                                          isEnglishVerified: checked,
                                          languageLabel: checked
                                            ? '영어 가능 (검증됨)'
                                            : '한국어 서비스',
                                        }
                                      : d
                                  );
                                  saveDriverProfiles(next);
                                }}
                                className="rounded border-slate-300 text-[#1E60F3]"
                              />
                              <span
                                className={
                                  drv.isEnglishVerified ? 'text-[#1E60F3]' : 'text-slate-500'
                                }
                              >
                                {drv.isEnglishVerified ? '영어 서비스 가능 (검증)' : '한국어 전용'}
                              </span>
                            </label>
                          </td>
                          <td className="py-2 px-3 font-black text-slate-900">
                            {formatKRW(drv.customContractLaborRate ?? defaultPay)}
                            <span className="text-[10px] text-slate-400 font-normal ml-1.5">
                              ({drv.vehicleTier === 'sprinter' ? '스프린터 기준' : '일반차량 -5만 기준'})
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsPresetModalOpen(false);
                  showToast('요금 프리셋 및 기사 언어/인건비 설정이 저장되었습니다.');
                }}
                className="px-5 py-2.5 rounded-xl bg-[#1E60F3] text-white text-xs font-black cursor-pointer"
              >
                확인 및 닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: 고객사/행사별 계약 단가 및 초과요율 설정 모달 */}
      {isContractModalOpen && selectedReport && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  {selectedReport.customerName} 계약 요금 · 초과요율 설정
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  구체적인 계약 요금이 등록되면 임시 프리셋보다 우선 적용됩니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsContractModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">적용 요금 단계 (우선순위)</label>
                <select
                  value={editPricingSource}
                  onChange={(e) => setEditPricingSource(e.target.value as PricingTierSource)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value="preset">1단계: 공통 임시 요금 프리셋</option>
                  <option value="customer_contract">2단계: 고객사별 계약 요금 (프리셋보다 우선)</option>
                  <option value="event_special">3단계: 행사별 특별 요금</option>
                  <option value="booking_override">4단계: 개별 배차 관리자 확정 요금</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">기본 계약 서비스 시간</label>
                  <input
                    type="number"
                    value={editBaseHours}
                    onChange={(e) => setEditBaseHours(parseInt(e.target.value, 10) || 10)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">차량 기본 요금 (원)</label>
                  <input
                    type="number"
                    step={10000}
                    value={editBaseRate}
                    onChange={(e) => setEditBaseRate(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    시간당 초과요금 (0 입력 시 미정)
                  </label>
                  <input
                    type="number"
                    step={5000}
                    value={editOvertimeRate}
                    onChange={(e) => setEditOvertimeRate(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">초과시간 반올림 규칙</label>
                  <select
                    value={`${editRoundingUnit}-${editRoundingMethod}`}
                    onChange={(e) => {
                      const [u, m] = e.target.value.split('-');
                      setEditRoundingUnit(parseInt(u, 10));
                      setEditRoundingMethod(m as 'ceil' | 'round' | 'floor' | 'exact');
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  >
                    <option value="30-ceil">30분 단위 올림</option>
                    <option value="10-ceil">10분 단위 올림</option>
                    <option value="60-ceil">1시간 단위 올림</option>
                    <option value="1-exact">분 단위 실계산</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  부가세(VAT) 처리 기준 (임의 가산 금지)
                </label>
                <select
                  value={editVatMode}
                  onChange={(e) => setEditVatMode(e.target.value as VatHandlingMode)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value="unset">미확정 (별도 확인 · 임의 가산 안 함)</option>
                  <option value="excluded">부가세 별도 (+10% 가산)</option>
                  <option value="included">부가세 포함 (단가에 포함됨)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsContractModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveContractTerms}
                className="px-5 py-2 rounded-xl bg-[#1E60F3] text-white text-xs font-black cursor-pointer"
              >
                요율 적용 및 재계산
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
};

export default HqReportsView;

