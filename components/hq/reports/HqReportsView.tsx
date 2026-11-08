"use client";

import React, { useState, useMemo, useSyncExternalStore, useEffect } from "react";
import {
  BarChart3,
  Building2,
  Calendar,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Globe,
  Info,
  Lock,
  MoreHorizontal,
  Printer,
  Receipt,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Upload,
  Users,
  AlertTriangle,
  X,
} from "lucide-react";
import {
  CustomerContractTerms,
  EventSettlementReport,
  PricingTierSource,
  SettlementReportStatus,
  VatHandlingMode,
} from "@/types/settlementHq";
import {
  exportAdminProfitabilityCsv,
  exportClientSettlementCsv,
  getDriverProfilesSnapshot,
  getSettlementReportsServerSnapshot,
  getSettlementReportsSnapshot,
  getVehiclePresetsSnapshot,
  saveDriverProfiles,
  saveVehiclePresets,
  subscribeSettlementReports,
  updateSettlementReportContractTerms,
  updateSettlementReportStatus,
} from "@/utils/settlementStorage";
import { formatKRW } from "@/utils/expense";
import { haptics } from "@/utils/haptics";
import { HqDateRangePicker } from "@/components/hq/ui/HqDateRangePicker";
import { HqSearchSelect } from "@/components/hq/ui/HqSearchSelect";
import { HqServerSettlementPanel } from "@/components/hq/reports/HqServerSettlementPanel";
import { ALL_HQ_DATES, matchesHqDateRange, formatHqDateRangeLabel, type HqDateRange } from "@/utils/hqDateRange";
import { exportSettlementSummaryCsv } from "@/utils/settlementSummaryCsv";
import { buildHqSettlementProfitTrend } from "@/utils/hqSettlementProfitTrend";
import { canPublishHqSettlementReport, isHqSettlementPreviewFixture, HQ_SETTLEMENT_UNVERIFIED_NOTICE } from "@/utils/hqSettlementTrustGuard";
import { getKstTodayDateStr } from "@/utils/dispatchConflictDetector";
import { resolveHqDateBounds } from "@/utils/hqDateRange";

export interface HqReportsViewProps {
  initialSearchQuery?: string;
  initialCustomerId?: string;
}

export const HqReportsView: React.FC<HqReportsViewProps> = ({
  initialSearchQuery = "",
  initialCustomerId,
}) => {
  const reports = useSyncExternalStore(
    subscribeSettlementReports,
    getSettlementReportsSnapshot,
    getSettlementReportsServerSnapshot
  );

  // Legacy fixtures are not company business records.
  const workingReports = useMemo(() => reports.filter(r => !isHqSettlementPreviewFixture(r)), [reports]);

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

  // Sub Tab Navigation
  const [activeSubTab, setActiveSubTab] = useState<"events" | "profitability" | "comprehensive">("events");

  // Filters
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [statusFilter, setStatusFilter] = useState<"all" | SettlementReportStatus>("all");
  const [dateRange, setDateRange] = useState<HqDateRange>(ALL_HQ_DATES);
  const [selectedReportId, setSelectedReportId] = useState<string>(() => {
    if (initialCustomerId) {
      const match = reports.find((r) => r.customerId === initialCustomerId);
      if (match) return match.id;
    }
    return reports[0]?.id || "";
  });

  // View Mode: "admin_internal" (본사 내부 정산·수익성 뷰) vs "client_external" (고객사 전달용 리포트 뷰 - 내부원가/마진 완벽 제거)
  const [reportViewMode, setReportViewMode] = useState<"admin_internal" | "client_external">(
    "admin_internal"
  );

  // Accordion Expand/Collapse States for Toss-style Detail View
  const [isVehiclesExpanded, setIsVehiclesExpanded] = useState(true);
  const [isExpensesExpanded, setIsExpensesExpanded] = useState(false);
  const [isBillingExpanded, setIsBillingExpanded] = useState(false);
  const [isProfitExpanded, setIsProfitExpanded] = useState(false);

  // Popover menus
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showDetailMenu, setShowDetailMenu] = useState(false);

  // Modals
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [confirmDirectCostsOnApprove, setConfirmDirectCostsOnApprove] = useState(false);

  // Contract Edit Form State
  const [editBaseHours, setEditBaseHours] = useState(10);
  const [editBaseRate, setEditBaseRate] = useState(800000);
  const [editOvertimeRate, setEditOvertimeRate] = useState(60000);
  const [editRoundingUnit, setEditRoundingUnit] = useState(30);
  const [editRoundingMethod, setEditRoundingMethod] = useState<"ceil" | "round" | "floor" | "exact">("ceil");
  const [editVatMode, setEditVatMode] = useState<VatHandlingMode>("unset");
  const [editPricingSource, setEditPricingSource] = useState<PricingTierSource>("customer_contract");

  useEffect(() => {
    const handleClickOutside = () => {
      setShowHeaderMenu(false);
      setShowDetailMenu(false);
    };
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3200);
  };

  const formatEventDateWithDay = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month - 1, day);
      const days = ["일", "월", "화", "수", "목", "금", "토"];
      const dayName = days[d.getDay()];
      return `${parts[0]}. ${parts[1]}. ${parts[2]} (${dayName})`;
    }
    return dateStr.replace(/-/g, ". ");
  };

  // Global period selection is shared by events, profitability and the ledger.
  const periodReports = useMemo(() => workingReports.filter(r =>
    matchesHqDateRange(r.rawDate || r.eventDate, dateRange)
  ), [workingReports, dateRange]);

  // Status/search refine only the event list; period is global.
  const filteredReports = useMemo(() => {
    return periodReports.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
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
  }, [periodReports, statusFilter, searchQuery]);

  const selectedReport = useMemo(() => {
    return (
      filteredReports.find((r) => r.id === selectedReportId) ||
      filteredReports[0] ||
      null
    );
  }, [filteredReports, selectedReportId]);

  // Dashboard Aggregate KPIs
  const dashboardKpis = useMemo(() => {
    const totalRevenue = periodReports.reduce((s, r) => s + r.supplyAmount, 0);
    const totalDriverLabor = periodReports.reduce((s, r) => s + r.totalDriverLaborCost, 0);
    const totalApprovedExpenses = periodReports.reduce((s, r) => s + r.totalApprovedExpenses, 0);
    const totalDirectProfit = periodReports.reduce((s, r) => s + r.totalDirectProfit, 0);
    const avgMargin =
      totalRevenue > 0 ? Number(((totalDirectProfit / totalRevenue) * 100).toFixed(1)) : 0;
    const totalOvertimeMin = periodReports.reduce((s, r) => s + r.totalOvertimeMinutes, 0);
    const totalOvertimeFare = periodReports.reduce((s, r) => s + r.totalOvertimeFare, 0);
    const approvedCount = periodReports.filter(
      (r) => r.status === "approved" || r.status === "invoiced"
    ).length;
    const pendingCount = periodReports.length - approvedCount;

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
  }, [periodReports]);

  const profitTrend = useMemo(() => {
    const periodEnd = resolveHqDateBounds(dateRange)?.to || getKstTodayDateStr();
    return buildHqSettlementProfitTrend(periodReports, periodEnd);
  }, [periodReports, dateRange]);
  const trendHasActualData = profitTrend.some(day => day.reportCount > 0);
  const trendMaxAbsolute = Math.max(1, ...profitTrend.map(day => Math.abs(day.directProfit)));

  // Open contract editor for selected report
  const handleOpenContractModal = () => {
    if (!selectedReport) return;
    haptics.lightTap();
    const firstVeh = selectedReport.vehicles[0];
    setEditBaseHours(selectedReport.contractTerms?.baseHours || firstVeh?.baseContractHours || 10);
    setEditBaseRate(selectedReport.contractTerms?.baseRate || firstVeh?.baseFare || 800000);
    setEditOvertimeRate(selectedReport.contractTerms?.overtimeHourlyRate || 60000);
    setEditRoundingUnit(selectedReport.contractTerms?.roundingUnitMinutes || 30);
    setEditRoundingMethod(selectedReport.contractTerms?.roundingMethod || "ceil");
    setEditVatMode(selectedReport.vatMode || "unset");
    setEditPricingSource("customer_contract");
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
      isTemporaryPreset: editPricingSource === "preset",
      pricingSource: editPricingSource,
    };
    updateSettlementReportContractTerms(selectedReport.id, terms, editVatMode);
    setIsContractModalOpen(false);
    showToast(`${selectedReport.customerName} 행사 정산 요율 및 계약조건이 반영되었습니다.`);
  };

  // Download Client CSV (Strictly excludes driver labor & company profit!)
  const handleDownloadClientCsv = () => {
    if (!selectedReport) return;
    if (!canPublishHqSettlementReport(selectedReport)) {
      showToast("서버 정산 승인·발행 검증이 없어 고객사 제출용 Excel은 사용할 수 없습니다.");
      return;
    }
    if (selectedReport.status !== "approved" && selectedReport.status !== "invoiced") {
      showToast("관리자 검토·승인 완료 후 고객사 제출용 확정 정산서를 다운로드할 수 있습니다.");
      return;
    }
    haptics.selection();
    const csv = exportClientSettlementCsv(selectedReport);
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `고객사제출용_운행정산서_${selectedReport.customerName}_${selectedReport.reportNo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("고객사 제출용 정산 명세서(내부 인건비/수익 제외) Excel(CSV) 다운로드가 완료되었습니다.");
  };

  // Download Admin Internal Profitability CSV
  const handleDownloadAdminCsv = () => {
    if (!selectedReport) return;
    haptics.selection();
    const csv = exportAdminProfitabilityCsv(selectedReport);
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `[잠정_로컬작업본_대외비]_수익성분석_${selectedReport.customerName}_${selectedReport.reportNo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("본사 내부용 배차별 수익성 분석 Excel(CSV) 다운로드가 완료되었습니다.");
  };

  // Comprehensive export includes every row in the selected period.
  const handleDownloadAllSummaryCsv = () => {
    if (!periodReports.length) {
      showToast('선택한 기간에 내보낼 정산 리포트가 없습니다.');
      return;
    }
    const csv = exportSettlementSummaryCsv(periodReports);
    const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = `[잠정_로컬작업본_본사내부용]_행사정산총괄_${formatHqDateRangeLabel(dateRange).replace(/[^가-힣0-9.-]/g, '_')}.csv`;
      a.click();
      showToast(`선택 기간의 ${periodReports.length}건을 Excel(CSV)로 내보냈습니다.`);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  // Print / PDF Export
  const handlePrintPdf = () => {
    if (!selectedReport) return;
    if (reportViewMode === "client_external" && !canPublishHqSettlementReport(selectedReport)) {
      showToast("서버 정산 승인·발행 검증 전에는 고객사 제출용 인쇄가 제한됩니다.");
      return;
    }
    if (
      reportViewMode === "client_external" &&
      selectedReport.status !== "approved" &&
      selectedReport.status !== "invoiced"
    ) {
      showToast("관리자 검토·승인 완료 후 고객사 제출용 PDF/인쇄가 가능합니다.");
      return;
    }
    haptics.selection();
    window.print();
  };

  const getStatusBadge = (status: SettlementReportStatus) => {
    switch (status) {
      case "approved":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-[#F2F5FA] text-[#546984] border border-[#EEF1F6] inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>승인 표시 · 로컬 미검증</span>
          </span>
        );
      case "invoiced":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-blue-50 text-[#1E60F3] border border-blue-200 inline-flex items-center gap-1">
            <Receipt className="w-3 h-3" />
            <span>청구 표시 · 로컬 미검증</span>
          </span>
        );
      case "reviewing":
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
    if (source === "unregistered") {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-700 border border-rose-200">
          요금 미등록 · 확인필요
        </span>
      );
    }
    if (isTemp || source === "preset") {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
          임시 단가 프리셋 (예상)
        </span>
      );
    }
    if (source === "booking_override") {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 text-purple-700">
          개별 배차 확정단가
        </span>
      );
    }
    if (source === "event_special") {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700">
          행사 특별단가
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#F2F5FA] text-[#546984]">
        고객사 계약단가
      </span>
    );
  };

  return (
    <div className="space-y-4 select-none">
      <HqServerSettlementPanel />
      <div role="status" className="rounded-2xl bg-white px-4 py-3.5 text-xs leading-5 text-[#52647A] shadow-[0_6px_24px_rgba(35,49,78,0.055)] print:border print:border-[#CFD6E0]">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#1E60F3]" aria-hidden="true" />
          <div>
            <p className="font-bold text-[#17233B]">잠정 정산 · 서버 미검증</p>
            <p className="mt-1">{HQ_SETTLEMENT_UNVERIFIED_NOTICE}</p>
            <p className="mt-1">초기 예시 정산서는 목록·통계에서 제외되며, 고객사 제출용 출력과 청구 승인은 서버 승인 기능이 준비될 때까지 차단됩니다.</p>
          </div>
        </div>
      </div>
      {/* 1. Header Bar: Title + Rounded Utility Controls (Card Box) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:px-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-20 print:hidden">
        <div className="flex items-center gap-3">
          {/* 리포트 통계 아이콘 & 마우스 호버 툴팁 */}
          <div className="relative group/report inline-flex items-center justify-center cursor-pointer shrink-0">
            <img
              src="/images/icons/report/icon_report.png"
              alt="종합 리포트"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = 'flex';
              }}
              className="w-11 h-11 sm:w-12 sm:h-12 object-contain shrink-0 transition-transform duration-150 group-hover/report:scale-110"
            />
            <div className="hidden w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-blue-50 border border-blue-100 text-[#1E60F3] items-center justify-center shrink-0 transition-transform duration-150 group-hover/report:scale-110 shadow-2xs">
              <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>

            {/* Hover Tooltip: 위로 향하는 블랙 말풍선 규격 (최상단 레이어) */}
            <div className="absolute bottom-full left-0 mb-2 hidden group-hover/report:flex flex-col items-start pointer-events-none z-[100]">
              <span className="whitespace-nowrap rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-[#53647B] shadow-[0_5px_18px_rgba(35,49,78,0.12)] animate-in fade-in-50 duration-150">
                고객사 정산과 기사 인건비, 배차별 직접이익을 종합 분석해요
              </span>
              <div className="w-2 h-2 bg-white rotate-45 -mt-1 ml-4 shadow-xs" />
            </div>
          </div>

          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              정산 · 수익성 · 종합 리포트
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              로컬 작업본 기준 예상 청구액 · 인건비 · 잠정 직접이익 분석
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <HqDateRangePicker
            value={dateRange}
            onChange={(next) => { setDateRange(next); setShowHeaderMenu(false); }}
            label="행사 정산"
          />

          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowHeaderMenu(!showHeaderMenu);
              }}
              className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/80 cursor-pointer shadow-2xs transition-colors"
              title="설정 및 추가 옵션"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {showHeaderMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-1.5 z-40 bg-white rounded-2xl border border-slate-200 shadow-xl py-1.5 w-56 animate-in fade-in zoom-in-95 duration-100"
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowHeaderMenu(false);
                    setIsPresetModalOpen(true);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                >
                  <Settings2 className="w-3.5 h-3.5 text-[#1E60F3]" />
                  <span>기본 요금 및 인건비 설정</span>
                </button>

              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Sub-Tab Underline Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200/80 pt-1 pb-0 print:hidden">
        <div className="flex items-center gap-6 text-sm">
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              setActiveSubTab("events");
            }}
            className={`pb-2.5 font-bold transition-all relative cursor-pointer ${
              activeSubTab === "events"
                ? "text-[#1E60F3]"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <span>행사별 정산</span>
            {activeSubTab === "events" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1E60F3] rounded-full" />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              setActiveSubTab("profitability");
            }}
            className={`pb-2.5 font-bold transition-all relative cursor-pointer ${
              activeSubTab === "profitability"
                ? "text-[#1E60F3]"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <span>수익성 분석</span>
            {activeSubTab === "profitability" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1E60F3] rounded-full" />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              setActiveSubTab("comprehensive");
            }}
            className={`pb-2.5 font-bold transition-all relative cursor-pointer ${
              activeSubTab === "comprehensive"
                ? "text-[#1E60F3]"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <span>종합 리포트</span>
            {activeSubTab === "comprehensive" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1E60F3] rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* Sub-Tab Content 1: 행사별 정산 (Split Master-Detail View) */}
      {activeSubTab === "events" && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Left Column (4 cols): Master List */}
          <div className="xl:col-span-4 bg-white rounded-2xl border border-slate-100 shadow-xs p-4 space-y-3 print:hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">행사별 정산 리포트 목록</h3>
              <span className="text-xs font-medium text-slate-400">{filteredReports.length}건</span>
            </div>

            {/* Search and Status Dropdown */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="고객사, 행사명, 차량 검색"
                  className="w-full pl-8.5 pr-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                />
              </div>
              <HqSearchSelect
                label="정산 상태 필터"
                size="sm"
                value={statusFilter}
                onChange={(next) => setStatusFilter(next as "all" | SettlementReportStatus)}
                placeholder="전체 상태"
                options={[
                  { value: "all", label: "전체 상태" },
                  { value: "draft", label: "청구 대기" },
                  { value: "reviewing", label: "검토 중" },
                  { value: "approved", label: "로컬 승인 표시(미검증)" },
                  { value: "invoiced", label: "로컬 청구 표시(미검증)" },
                ]}
              />
            </div>

            {/* Cards List */}
            <div className="space-y-2 max-h-[720px] overflow-y-auto pr-1">
              {filteredReports.map((rep) => {
                const isSelected = selectedReport?.id === rep.id;
                const formattedDate = formatEventDateWithDay(rep.eventDate);
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
                    className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? "bg-blue-50/70 border-blue-200/80 shadow-xs"
                        : "bg-white hover:bg-slate-50/80 border-slate-100 shadow-2xs"
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="font-bold text-sm text-slate-900 truncate">
                        {title}
                      </div>
                      <div className="text-xs text-slate-400 font-medium">
                        {formattedDate}
                      </div>
                      <div className="font-extrabold text-sm text-slate-900 pt-0.5">
                        {rep.supplyAmount > 0 ? formatKRW(rep.grandTotal) : "요금 미등록"}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                );
              })}
              {filteredReports.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-400">
                  표시할 로컬 정산 작업본이 없습니다. 초기 예시 데이터는 제외됩니다.
                </div>
              )}
            </div>
          </div>

          {/* Right Column (8 cols): Detail View */}
          <div className="xl:col-span-8 space-y-4">
            {selectedReport ? (
              <>
                {/* Top Action Bar */}
                <div className="flex items-center justify-between pb-1 print:hidden">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        haptics.selection();
                        setReportViewMode("admin_internal");
                      }}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all border ${
                        reportViewMode === "admin_internal"
                          ? "bg-white border-slate-900 text-slate-900 shadow-xs font-bold"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-700" />
                      <span>내부 정산서</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        haptics.selection();
                        setReportViewMode("client_external");
                      }}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all border ${
                        reportViewMode === "client_external"
                          ? "bg-white border-slate-900 text-slate-900 shadow-xs font-bold"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-700" />
                      <span>고객사 양식 미리보기</span>
                    </button>
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDetailMenu(!showDetailMenu);
                      }}
                      className="p-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer shadow-2xs transition-colors"
                      title="더보기"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {showDetailMenu && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-full mt-1.5 z-30 bg-white rounded-2xl border border-slate-200 shadow-xl py-1.5 w-52 animate-in fade-in zoom-in-95 duration-100"
                      >
                        {reportViewMode === "admin_internal" && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setShowDetailMenu(false);
                                handleOpenContractModal();
                              }}
                              className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                            >
                              <Settings2 className="w-3.5 h-3.5 text-[#1E60F3]" />
                              <span>계약·요율 설정</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowDetailMenu(false);
                                handleDownloadAdminCsv();
                              }}
                              className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                            >
                              <img src="/images/icons/icon_excel.png" alt="Excel" className="w-3.5 h-3.5 object-contain" />
                              <span>내부 수익성 Excel</span>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setShowDetailMenu(false);
                            handleDownloadClientCsv();
                          }}
                          disabled={!canPublishHqSettlementReport(selectedReport)}
                          title="서버 승인 원장 연동 전까지 사용할 수 없습니다"
                          className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <img src="/images/icons/icon_excel.png" alt="Excel" className="w-3.5 h-3.5 object-contain" />
                          <span>고객사 제출용 Excel · 발행 대기</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowDetailMenu(false);
                            handlePrintPdf();
                          }}
                          disabled={reportViewMode === "client_external" && !canPublishHqSettlementReport(selectedReport)}
                          title={reportViewMode === "client_external" ? "서버 승인 전 고객사 인쇄 제한" : "내부 잠정 작업본 인쇄"}
                          className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 border-t border-slate-100 mt-1 pt-1.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Printer className="w-3.5 h-3.5 text-slate-600" />
                          <span>PDF / 인쇄</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Event Overview Card */}
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs space-y-4">
                  {/* Top Meta */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400">
                      {selectedReport.reportNo}
                    </span>
                    {getPricingSourceBadge(selectedReport.pricingSource, selectedReport.isTemporaryPreset)}
                  </div>

                  {/* Main Header Row */}
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                      {selectedReport.eventName.startsWith(selectedReport.customerName)
                        ? selectedReport.eventName
                        : `${selectedReport.customerName} ${selectedReport.eventName}`}
                    </h3>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] text-slate-400 font-medium">예상 청구 금액</div>
                      <div className="text-xl font-extrabold text-slate-900 mt-0.5 tracking-tight">
                        {selectedReport.supplyAmount > 0
                          ? formatKRW(selectedReport.grandTotal)
                          : "단가 확인 필요"}
                      </div>
                      <div className="text-[11px] text-slate-400 font-normal mt-0.5">
                        {selectedReport.vatMode === "excluded"
                          ? "부가세(VAT) 별도 (+10%)"
                          : selectedReport.vatMode === "included"
                          ? "부가세(VAT) 포함"
                          : "부가세(VAT) 포함 여부 미확정"}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Meta 3-Cols + Date/Location */}
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-[11px] text-slate-400 font-medium block">발주 고객사</span>
                        <span className="font-bold text-slate-800 mt-0.5 block truncate">
                          {selectedReport.orderingAgency || selectedReport.customerName}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 font-medium block">최종 브랜드</span>
                        <span className="font-bold text-slate-800 mt-0.5 block truncate">
                          {selectedReport.endBrand || selectedReport.customerName}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 font-medium block">실제 청구 대상</span>
                        <span className="font-bold text-slate-800 mt-0.5 block truncate">
                          {selectedReport.billingTargetName || `${selectedReport.customerName} 귀하`}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 text-xs">
                      <span className="text-[11px] text-slate-400 font-medium block">행사 일자 · 장소</span>
                      <span className="font-medium text-slate-700 mt-0.5 block truncate">
                        {formatEventDateWithDay(selectedReport.eventDate)} · {selectedReport.location}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Dispatched Vehicle & Settlement Card */}
                <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs space-y-4">
                  <button
                    type="button"
                    onClick={() => setIsVehiclesExpanded(!isVehiclesExpanded)}
                    className="w-full flex items-center justify-between text-left cursor-pointer"
                  >
                    <h4 className="text-sm font-bold text-slate-900">
                      투입 차량 및 정산 ({selectedReport.totalVehiclesCount}대)
                    </h4>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                        isVehiclesExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isVehiclesExpanded && (
                    <div className="space-y-4 pt-1">
                      {selectedReport.vehicles.map((v, vIdx) => (
                        <div key={v.vehiclePlate || vIdx} className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#4A85F6] text-white">
                                {vIdx + 1}호차
                              </span>
                              <span className="font-bold text-slate-900 text-sm">
                                {v.vehicleModel} · {v.vehiclePlate}
                              </span>
                              <span className="text-xs text-slate-500 font-medium">
                                · 담당: {v.driverName}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-black text-slate-900">
                                {v.hasContractTerms ? formatKRW(v.vehicleFareSubtotal) : "요금 미등록"}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-4 bg-slate-50/80 rounded-xl p-3 border border-slate-100 text-center gap-2">
                            <div>
                              <span className="text-[11px] text-slate-400 font-medium block">
                                {reportViewMode === "client_external" ? "기본 요금" : "차량 요금"}
                              </span>
                              <span className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5 block">
                                {formatKRW(v.clientTotalRevenue)}
                              </span>
                            </div>
                            <div>
                              <span className="text-[11px] text-slate-400 font-medium block">
                                {reportViewMode === "client_external" ? "초과 요금" : "기사 인건비"}
                              </span>
                              <span className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5 block">
                                {reportViewMode === "client_external"
                                  ? formatKRW(v.overtimeFare)
                                  : `-${formatKRW(v.driverLaborCost)}`}
                              </span>
                            </div>
                            <div>
                              <span className="text-[11px] text-slate-400 font-medium block">
                                {reportViewMode === "client_external" ? "승인 실비" : "직접 경비"}
                              </span>
                              <span className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5 block">
                                {reportViewMode === "client_external"
                                  ? formatKRW(
                                      v.expenses
                                        .filter((e) => e.status === "승인 완료" && e.billableToCustomer !== false)
                                        .reduce((s, e) => s + e.amount, 0)
                                    )
                                  : `-${formatKRW(v.vehicleDirectCost + v.otherDirectCost)}`}
                              </span>
                            </div>
                            <div>
                              <span className="text-[11px] text-slate-400 font-medium block">
                                {reportViewMode === "client_external" ? "청구 소계" : "배차 직접이익"}
                              </span>
                              <span className="text-xs sm:text-sm font-bold text-[#1E60F3] mt-0.5 block">
                                {reportViewMode === "client_external" ? (
                                  formatKRW(v.vehicleFareSubtotal)
                                ) : (
                                  <>
                                    {formatKRW(v.directProfit)}{" "}
                                    <span className="text-[11px] font-semibold text-slate-500 block sm:inline">
                                      ({v.directMarginPercent}%)
                                    </span>
                                  </>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3 Drilldown / Accordion Rows (Toss Style) */}
                <div className="space-y-2.5">
                  {/* Row 1: 승인된 실비 경비 및 영수증 증빙 내역 */}
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-2xs overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setIsExpensesExpanded(!isExpensesExpanded)}
                      className="w-full flex items-center justify-between p-4 hover:bg-slate-50/60 transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <Receipt className="w-4 h-4 text-slate-500 shrink-0" />
                        <span className="text-xs sm:text-sm font-semibold text-slate-800">
                          승인된 실비 경비 및 영수증 증빙 내역
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-700">
                        <span>{formatKRW(selectedReport.totalApprovedExpenses)}</span>
                        <ChevronRight
                          className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${
                            isExpensesExpanded ? "rotate-90" : ""
                          }`}
                        />
                      </div>
                    </button>
                    {isExpensesExpanded && (
                      <div className="p-4 pt-0 border-t border-slate-100 mt-2 space-y-3">
                        {selectedReport.vehicles.flatMap((v) => v.expenses).length > 0 ? (
                          <div className="overflow-x-auto rounded-xl border border-slate-200/80 mt-3">
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
                                      reportViewMode === "client_external"
                                        ? e.status === "승인 완료" && e.billableToCustomer !== false
                                        : true
                                    )
                                    .map((exp) => (
                                      <tr key={exp.id} className="hover:bg-slate-50/70">
                                        <td className="py-2.5 px-3 font-bold text-slate-800">
                                          {v.vehicleModel} ({v.driverName})
                                        </td>
                                        <td className="py-2.5 px-3 text-slate-500">{exp.submittedDate || exp.rawDate}</td>
                                        <td className="py-2.5 px-3">
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                                            {exp.category}
                                          </span>
                                        </td>
                                        <td className="py-2.5 px-3 font-medium text-slate-700">
                                          {exp.merchant || "-"}
                                        </td>
                                        <td className="py-2.5 px-3">
                                          {exp.billableToCustomer ? (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#F2F5FA] text-[#546984] border border-[#EEF1F6]">
                                              고객사 청구 실비
                                            </span>
                                          ) : (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                                              회사 내부 처리
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-2.5 px-3">
                                          {exp.status === "승인 완료" ? (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-50 text-[#1E60F3] border border-blue-200">
                                              승인 완료
                                            </span>
                                          ) : (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                              {exp.status}
                                            </span>
                                          )}
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
                          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 text-center text-xs text-slate-400 font-medium mt-3">
                            이 행사에 등록된 추가 실비 영수증이 없습니다.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Row 2: 고객사 청구 금액 합계 명세 */}
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-2xs overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setIsBillingExpanded(!isBillingExpanded)}
                      className="w-full flex items-center justify-between p-4 hover:bg-slate-50/60 transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
                        <span className="text-xs sm:text-sm font-semibold text-slate-800">
                          고객사 청구 금액 합계 명세
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-700">
                        <span>{formatKRW(selectedReport.grandTotal)}</span>
                        <ChevronRight
                          className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${
                            isBillingExpanded ? "rotate-90" : ""
                          }`}
                        />
                      </div>
                    </button>
                    {isBillingExpanded && (
                      <div className="p-4 pt-0 border-t border-slate-100 mt-2 space-y-2 text-xs">
                        <div className="flex justify-between text-slate-600 pt-2">
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
                            {selectedReport.vatMode === "excluded"
                              ? formatKRW(selectedReport.vatAmount)
                              : selectedReport.vatMode === "included"
                              ? "공급가에 포함됨"
                              : "별도 확인 (미포함)"}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm font-black text-[#1E60F3] pt-2 border-t border-slate-200">
                          <span>잠정 청구 합계</span>
                          <span>{formatKRW(selectedReport.grandTotal)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Row 3: 내부 정산 손익 명세 (Admin Internal Only) */}
                  {reportViewMode === "admin_internal" && (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-2xs overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setIsProfitExpanded(!isProfitExpanded)}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50/60 transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2.5">
                          <TrendingUp className="w-4 h-4 text-slate-500 shrink-0" />
                          <span className="text-xs sm:text-sm font-semibold text-slate-800">
                            내부 정산 손익 명세
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-700">
                          <ChevronRight
                            className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${
                              isProfitExpanded ? "rotate-90" : ""
                            }`}
                          />
                        </div>
                      </button>
                      {isProfitExpanded && (
                        <div className="p-4 pt-0 border-t border-slate-100 mt-2 space-y-2 text-xs">
                          <div className="flex justify-between text-slate-600 pt-2">
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
                          <div className="flex justify-between text-sm font-black text-[#1E60F3] pt-2 border-t border-slate-200">
                            <span>잠정 배차 직접이익</span>
                            <span>
                              {formatKRW(selectedReport.totalDirectProfit)} ({selectedReport.averageDirectMarginPercent}%)
                            </span>
                          </div>
                          <div className="pt-2 text-[11px] text-slate-400 flex items-center justify-between">
                            <span>이익 검증 상태</span>
                            <span className="font-bold text-slate-700">
                              {"서버 미검증 · 잠정 손익"}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Fixed Action Bar */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 print:hidden">
                  <button
                    type="button"
                    onClick={() => {
                      haptics.lightTap();
                      updateSettlementReportStatus(selectedReport.id, "reviewing");
                      showToast("정산 리포트가 검토 중 상태로 전환되었습니다.");
                    }}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
                  >
                    검토 중으로 변경
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!canPublishHqSettlementReport(selectedReport)) {
                        showToast("서버 승인 원장이 없어 청구 승인을 진행할 수 없습니다.");
                        return;
                      }
                      haptics.successPulse();
                      updateSettlementReportStatus(
                        selectedReport.id,
                        "approved",
                        undefined,
                        true
                      );
                      showToast("정산 리포트 검토 및 승인이 완료되어 고객사 청구서 발행이 활성화되었습니다.");
                    }}
                    disabled={!canPublishHqSettlementReport(selectedReport)}
                    title="서버 정산 원장과 승인 기능 연동 전까지 비활성화됩니다"
                    className="px-5 py-2.5 rounded-xl bg-[#1E60F3] hover:bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:cursor-not-allowed disabled:bg-[#E8ECF2] disabled:text-[#8A99AE] disabled:shadow-none"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>청구 승인 · 서버 연동 대기</span>
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Sub-Tab Content 2: 수익성 분석 (KPI Tiles + Trend & Cost Charts + Profit Breakdown) */}
      {activeSubTab === "profitability" && (
        <div className="space-y-4">
          {/* Top 6 Settlement & Profitability KPI Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 print:hidden">
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                <span>예상 매출 (로컬)</span>
                <Building2 className="w-4 h-4 text-[#1E60F3]" />
              </div>
              <div className="text-lg sm:text-xl font-black text-slate-900 mt-2">
                {formatKRW(dashboardKpis.totalRevenue)}
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">임시 단가 포함</div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                <span>총 기사 인건비</span>
                <Users className="w-4 h-4 text-rose-500" />
              </div>
              <div className="text-lg sm:text-xl font-black text-rose-600 mt-2">
                -{formatKRW(dashboardKpis.totalDriverLabor)}
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">
                기본 + 초과근무
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                <span>승인 실비 경비</span>
                <Receipt className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-lg sm:text-xl font-black text-slate-900 mt-2">
                {formatKRW(dashboardKpis.totalApprovedExpenses)}
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">주유·통행·주차</div>
            </div>

            <div className="bg-white rounded-2xl border border-blue-100 p-4 shadow-2xs flex flex-col justify-between bg-blue-50/20">
              <div className="flex items-center justify-between text-xs text-[#1E60F3] font-bold">
                <span>잠정 배차 직접이익</span>
                <TrendingUp className="w-4 h-4 text-[#1E60F3]" />
              </div>
              <div className="text-lg sm:text-xl font-black text-[#1E60F3] mt-2">
                {formatKRW(dashboardKpis.totalDirectProfit)}
              </div>
              <div className="text-[11px] text-blue-500/80 font-medium mt-1">
                매출 - 인건비 - 직접경비
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                <span>예상 평균 마진율</span>
                <BarChart3 className="w-4 h-4 text-[#8294AC]" />
              </div>
              <div className="text-lg sm:text-xl font-black text-[#52647A] mt-2">
                {dashboardKpis.avgMargin}%
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">목표: 35.0% 이상</div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                <span>정산 현황</span>
                <CheckCircle2 className="w-4 h-4 text-[#1E60F3]" />
              </div>
              <div className="text-lg sm:text-xl font-black text-slate-900 mt-2">
                {dashboardKpis.approvedCount} / {periodReports.length}
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">
                로컬 승인 표시 {dashboardKpis.approvedCount}건 (미검증)
              </div>
            </div>
          </div>

          {/* Mini Analytics: 수익성 추이 & 비용 구성 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 print:hidden">
            {/* 수익성 추이 (7 cols) */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-100 p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">수익성 추이</h3>
                <span className="text-xs font-semibold text-slate-400">기간 내 최근 7일 · 로컬 입력 행사</span>
              </div>

              {trendHasActualData ? (
                <div role="img" aria-label="기간별 로컬 작업본 잠정 직접이익, 행사 날짜 기준" className="grid min-h-48 grid-cols-7 gap-1.5 py-2">
                  {profitTrend.map(day => (
                    <div key={day.date} className="flex min-w-0 flex-col items-center justify-end gap-1.5">
                      <div className="flex h-28 w-full flex-col">
                        <div className="flex h-14 items-end justify-center">
                          {day.directProfit > 0 && (
                            <div title={`${day.date} · 행사 ${day.reportCount}건 · 직접이익 ${formatKRW(day.directProfit)}`}
                              style={{ height: `${Math.max(5, Math.abs(day.directProfit) / trendMaxAbsolute * 100)}%` }}
                              className="w-[min(22px,70%)] rounded-t-[6px] bg-[#1E60F3]/85" />
                          )}
                        </div>
                        <div className="h-px w-full shrink-0 bg-[#E7ECF4]" />
                        <div className="flex h-14 items-start justify-center">
                          {day.directProfit < 0 && (
                            <div title={`${day.date} · 행사 ${day.reportCount}건 · 손실 ${formatKRW(day.directProfit)}`}
                              style={{ height: `${Math.max(5, Math.abs(day.directProfit) / trendMaxAbsolute * 100)}%` }}
                              className="w-[min(22px,70%)] rounded-b-[6px] bg-[#C88980]/85" />
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-[#8290A4] tabular-nums">{day.label}</span>
                      <span title={`${day.date}: ${day.reportCount}건`}
                        className="max-w-full truncate text-[10px] font-medium tabular-nums text-[#61728D]">
                        {day.reportCount ? formatKRW(day.directProfit) : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
                  <BarChart3 className="size-7 text-[#BBC7D7]" />
                  <p className="text-[12px] font-medium text-[#73839D]">
                    최근 7일 동안 정산된 행사 데이터가 없습니다.
                  </p>
                </div>
              )}
            </div>

            {/* 비용 구성 (5 cols) */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-100 p-5 shadow-2xs space-y-3 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">비용 구성</h3>
                <span className="text-xs font-semibold text-slate-400">매출 대비 비중</span>
              </div>

              <div className="flex items-center justify-around gap-4 py-2 my-auto">
                <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="38" fill="transparent" stroke="#F1F5F9" strokeWidth="12" />
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      fill="transparent"
                      stroke="#93C5FD"
                      strokeWidth="12"
                      strokeDasharray="238.76"
                      strokeDashoffset={
                        dashboardKpis.totalRevenue > 0
                          ? 238.76 * (1 - dashboardKpis.totalDriverLabor / dashboardKpis.totalRevenue)
                          : 238.76
                      }
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      fill="transparent"
                      stroke="#1E60F3"
                      strokeWidth="12"
                      strokeDasharray="238.76"
                      strokeDashoffset={
                        dashboardKpis.totalRevenue > 0
                          ? 238.76 * (1 - dashboardKpis.totalDirectProfit / dashboardKpis.totalRevenue)
                          : 238.76
                      }
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-xs font-semibold text-slate-400">마진율</span>
                    <span className="text-base font-black text-slate-900">{dashboardKpis.avgMargin}%</span>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#1E60F3] shrink-0" />
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
                로컬 공급가액 기준 잠정 집계
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab Content 3: 종합 리포트 (Full Ledger Overview) */}
      {activeSubTab === "comprehensive" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">행사 정산 총괄 명세서 · {periodReports.length}건</h3>
                <p className="text-xs text-slate-400 mt-0.5">선택한 기간의 리포트 현황 · {formatHqDateRangeLabel(dateRange)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadAllSummaryCsv}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <img src="/images/icons/icon_excel.png" alt="Excel" className="w-3.5 h-3.5 object-contain" />
                  <span>전체 Excel 내보내기</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-500">
                    <th className="py-2.5 px-3">정산 번호</th>
                    <th className="py-2.5 px-3">고객사 / 행사명</th>
                    <th className="py-2.5 px-3">행사 일자</th>
                    <th className="py-2.5 px-3 text-center">차량</th>
                    <th className="py-2.5 px-3 text-right">총 매출</th>
                    <th className="py-2.5 px-3 text-right">기사 인건비</th>
                    <th className="py-2.5 px-3 text-right">배차 직접이익</th>
                    <th className="py-2.5 px-3 text-center">마진율</th>
                    <th className="py-2.5 px-3 text-center">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {periodReports.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => {
                        // A ledger row must open the exact report selected, even
                        // if event-only status/search filters were active earlier.
                        setStatusFilter("all");
                        setSearchQuery("");
                        setSelectedReportId(r.id);
                        setActiveSubTab("events");
                      }}
                      className="hover:bg-slate-50/80 cursor-pointer"
                    >
                      <td className="py-2.5 px-3 font-semibold text-slate-500">{r.reportNo}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{r.eventName}</td>
                      <td className="py-2.5 px-3 text-slate-500">{r.eventDate}</td>
                      <td className="py-2.5 px-3 text-center font-semibold text-slate-600">{r.totalVehiclesCount}대</td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatKRW(r.grandTotal)}</td>
                      <td className="py-2.5 px-3 text-right text-rose-600 font-semibold">-{formatKRW(r.totalDriverLaborCost)}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-[#1E60F3]">{formatKRW(r.totalDirectProfit)}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-slate-700">{r.averageDirectMarginPercent}%</td>
                      <td className="py-2.5 px-3 text-center">{getStatusBadge(r.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: 기본 요금 프리셋 & 기사 인건비 관리 모달 */}
      {isPresetModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#17233B]/25 flex items-center justify-center p-4">
          <div className="bg-white rounded-[20px] shadow-[0_20px_52px_rgba(35,49,78,0.12)] max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
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
        <div className="fixed inset-0 z-50 bg-[#17233B]/25 flex items-center justify-center p-4">
          <div className="bg-white rounded-[20px] shadow-[0_20px_52px_rgba(35,49,78,0.12)] max-w-lg w-full p-6 space-y-4">
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
                <HqSearchSelect
                  label="정산 적용 요금 단계"
                  value={editPricingSource}
                  onChange={(next) => setEditPricingSource(next as PricingTierSource)}
                  placeholder="계약 요금 단계 선택"
                  options={[
                    { value: "preset", label: "1단계: 공통 임시 요금 프리셋" },
                    { value: "customer_contract", label: "2단계: 고객사별 계약 요금" },
                    { value: "event_special", label: "3단계: 행사별 특별 요금" },
                    { value: "booking_override", label: "4단계: 개별 배차 관리자 확정 요금" },
                  ]}
                />
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
                  <HqSearchSelect
                    label="초과시간 반올림 규칙"
                    value={`${editRoundingUnit}-${editRoundingMethod}`}
                    onChange={(next) => {
                      const [unit, method] = next.split("-");
                      setEditRoundingUnit(Number(unit));
                      setEditRoundingMethod(method as 'ceil' | 'round' | 'floor' | 'exact');
                    }}
                    placeholder="초과시간 계산 방식"
                    options={[
                      { value: "30-ceil", label: "30분 단위 올림" },
                      { value: "10-ceil", label: "10분 단위 올림" },
                      { value: "60-ceil", label: "1시간 단위 올림" },
                      { value: "1-exact", label: "분 단위 실계산" },
                    ]}
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  부가세(VAT) 처리 기준 (임의 가산 금지)
                </label>
                <HqSearchSelect
                  label="정산 부가세 처리 기준"
                  value={editVatMode}
                  onChange={(next) => setEditVatMode(next as VatHandlingMode)}
                  placeholder="부가세 처리 기준"
                  options={[
                    { value: "unset", label: "미확정", subtitle: "별도 확인 · 임의 가산하지 않음" },
                    { value: "excluded", label: "부가세 별도", subtitle: "공급가액에 10% 가산" },
                    { value: "included", label: "부가세 포함", subtitle: "단가에 이미 포함" },
                  ]}
                />
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
        <div className="fixed bottom-6 right-6 z-50 bg-[#F7F9FC] text-[#253552] text-xs font-semibold px-4 py-2.5 rounded-[14px] shadow-[0_8px_28px_rgba(35,49,78,0.12)] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
};

export default HqReportsView;

