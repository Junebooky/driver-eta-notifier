'use client';

import React, { useState } from 'react';
import {
  Building2,
  Search,
  Users,
  CalendarDays,
  ClipboardList,
  MessageSquareText,
  HeartHandshake,
  ShieldCheck,
  UserRound,
  Clock3,
  FileText,
  CheckCircle2,
  LayoutPanelLeft,
} from 'lucide-react';

type ClientTab =
  | 'overview'
  | 'contacts'
  | 'bookings'
  | 'events'
  | 'preferences'
  | 'communications'
  | 'contracts';

const CLIENT_TABS: { id: ClientTab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: '개요', icon: LayoutPanelLeft },
  { id: 'contacts', label: '담당자', icon: Users },
  { id: 'bookings', label: '예약·운행 이력', icon: ClipboardList },
  { id: 'events', label: '행사', icon: CalendarDays },
  { id: 'preferences', label: '요청·선호사항', icon: HeartHandshake },
  { id: 'communications', label: '소통 기록', icon: MessageSquareText },
  { id: 'contracts', label: '계약·정산', icon: FileText },
];

const SAMPLE_HISTORY = [
  { title: '공항 픽업 차량 구성 문의', detail: '차량 종류와 필요한 대수 확인 요청', source: '고객 문의 예시' },
  { title: '행사 이동 동선 변경 요청', detail: '픽업 장소 및 시간 변경 관련 문의', source: '운영 요청 예시' },
  { title: '영문 기사·차량 안내자료 요청', detail: '해외 참석자에게 보낼 안내자료 요청', source: '선호사항 예시' },
];

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-black text-slate-800">{children}</h3>;
}

function EmptyPreview({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center">
      <p className="text-sm font-bold text-slate-700">{title}</p>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

export function HqCustomersView({ search, onSearchChange }: { search: string; onSearchChange: (value: string) => void }) {
  const [sampleVisible, setSampleVisible] = useState(false);
  const [selectedTab, setSelectedTab] = useState<ClientTab>('overview');

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#1E60F3]">
              <Building2 className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-900">고객 관리</h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            주요 고객사, 담당자, 지난 요청, 행사 및 의전 선호사항을 한곳에서 확인합니다.
          </p>
        </div>
        <button
          type="button"
          aria-pressed={sampleVisible}
          onClick={() => {
            setSampleVisible((previous) => !previous);
            setSelectedTab('overview');
          }}
          className="rounded-xl border border-[#1E60F3]/30 bg-white px-3 py-2 text-xs font-bold text-[#1E60F3] transition-colors hover:bg-blue-50"
        >
          {sampleVisible ? '샘플 화면 닫기' : '샘플 화면 보기'}
        </button>
      </header>

      <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>고객 관리 UI 초안 · 실데이터 미연동</strong>
          {' '}고객사의 실제 연락처, 과거 예약, 이메일 및 계약 내용은 아직 불러오지 않습니다.
          고객사 등록과 변경사항 저장은 관리자 인증·데이터베이스 연동 후 제공됩니다.
          샘플 화면은 실제 고객 정보가 아닙니다.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section aria-label="고객사 목록" className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <SectionHeading>고객사 목록</SectionHeading>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
              {sampleVisible ? '샘플 1건' : '연동 대기'}
            </span>
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="고객사·담당자·예약번호 검색"
              aria-label="고객사·담당자·예약번호 검색"
              className="w-full min-w-0 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
            />
          </label>

          {sampleVisible && (!search.trim() || '샘플 고객사 A'.includes(search.trim())) ? (
            <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#1E60F3]">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-slate-900">샘플 고객사 A</p>
                  <p className="text-[11px] text-slate-500">관리 담당: HQ 관리자 (예시)</p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-[#1E60F3]">VIP 예시</span>
              </div>
              <p className="mt-2 text-xs text-slate-600">해외 임원 의전 · 행사 그룹 수송 (예시)</p>
              <p className="mt-1 text-[11px] text-slate-500">실제 기록 없음 · UI 미리보기</p>
            </div>
          ) : (
            <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center">
              <Building2 className="h-8 w-8 text-slate-300" />
              <p className="text-sm font-bold text-slate-700">
                {search.trim() ? '표시할 고객사 정보가 없습니다' : '고객사 데이터 연결 전입니다'}
              </p>
              <p className="text-xs leading-relaxed text-slate-500">
                {search.trim()
                  ? '실제 고객사 검색은 데이터베이스 연동 후 사용할 수 있습니다.'
                  : '고객사·담당자 정보는 승인된 관리 시스템에서만 불러옵니다.'}
              </p>
            </div>
          )}
        </section>

        <section aria-label="고객사 상세" className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          {sampleVisible && (!search.trim() || '샘플 고객사 A'.includes(search.trim())) ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black text-slate-900">샘플 고객사 A</h2>
                    <span className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-extrabold text-[#1E60F3]">예시</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">고객사 프로필 · 확인된 운영 정보와 수동 관리 기록을 구분합니다.</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  고객사 담당: <strong>HQ 관리자 (예시)</strong>
                </div>
              </div>
              <nav aria-label="고객사 정보 카테고리" className="my-4 flex flex-wrap gap-1.5">
                {CLIENT_TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedTab(id)}
                    aria-current={selectedTab === id ? 'page' : undefined}
                    className={selectedTab === id
                      ? 'flex items-center gap-1 rounded-lg bg-[#1E60F3] px-2.5 py-2 text-[11px] font-bold text-white'
                      : 'flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50'}
                  >
                    <Icon className="h-3.5 w-3.5" />{label}
                  </button>
                ))}
              </nav>

              {selectedTab === 'overview' && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <SectionHeading>최근 요청 사항</SectionHeading>
                    <div className="mt-3 space-y-3">
                      {SAMPLE_HISTORY.map((item) => (
                        <div key={item.title} className="border-l-2 border-blue-200 pl-3">
                          <p className="text-xs font-bold text-slate-700">{item.title}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{item.detail}</p>
                          <p className="mt-0.5 text-[10px] text-slate-400">{item.source}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-xl border border-slate-200 p-4">
                      <SectionHeading>주요 담당자</SectionHeading>
                      <p className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                        <UserRound className="h-4 w-4 text-[#1E60F3]" /> 예약 담당자 · 개인정보 비공개 (예시)
                      </p>
                      <p className="mt-1 text-xs text-slate-500">승인 권한, 연락 선호 채널, 담당 부서 확인</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <SectionHeading>행사 / 주요 일정</SectionHeading>
                      <p className="mt-2 text-xs text-slate-700">해외 임원 방문 (예시)</p>
                      <p className="mt-1 text-xs text-slate-500">실제 행사 일정은 예약 관리와 연동 예정</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <SectionHeading>운영 선호사항</SectionHeading>
                      <p className="mt-2 text-xs text-slate-700">영문 안내자료 · 차량 등급 요청 (예시)</p>
                      <p className="mt-1 text-xs text-slate-500">승인된 고객 요청과 수동 메모의 출처 별도 표시</p>
                    </div>
                  </div>
                </div>
              )}
              {selectedTab === 'contacts' && (
                <EmptyPreview title="담당자 / 연락처" detail="예약 요청 담당자, 의사결정권자, 현장 담당자, 회사 내부 책임자와 연락 방법을 역할별로 관리합니다. 실제 연락처는 비공개이며 별도 권한 승인 후 연동합니다." />
              )}
              {selectedTab === 'bookings' && (
                <EmptyPreview title="과거 요청 및 예약·운행 이력" detail="실제 예약번호, 고객 최초 요청, 변경 내역, 배정 차량·기사, 운행 완료 결과를 구분하여 시간순으로 보여줍니다. 이전 예약으로 새 초안을 만드는 기능은 향후 관리자 검토 후 지원합니다." />
              )}
              {selectedTab === 'events' && (
                <EmptyPreview title="행사 / 프로젝트" detail="임원 방문, 발표회, 학회, 그룹 수송 등 고객사별 행사와 행사에 연결된 여러 예약·차량·담당자를 함께 관리합니다." />
              )}
              {selectedTab === 'preferences' && (
                <EmptyPreview title="고객사 요청 및 서비스 선호사항" detail="선호 차량 모델·등급, 픽업 방식, 영문 안내, 인보이스, 행사별 특별 지침을 출처와 확인 날짜와 함께 관리합니다. 개인별 요청을 회사 전체 선호사항으로 추정하지 않습니다." />
              )}
              {selectedTab === 'communications' && (
                <EmptyPreview title="소통 기록 / 인수인계" detail="관리자가 기록한 통화 내용, 승인된 예약 관련 NAVER·Gmail 메일 참조, 문의·해결 내역을 타임라인으로 보여줍니다. 스팸이나 무관한 개인 메일은 가져오지 않습니다." />
              )}
              {selectedTab === 'contracts' && (
                <EmptyPreview title="계약 / 견적 / 정산" detail="법인 청구 정보, 계약 기간, 견적과 결제 조건은 별도 재무 권한이 있는 관리자에게만 제공할 예정입니다." />
              )}
            </>
          ) : (
            <div className="flex min-h-[410px] flex-col items-center justify-center gap-3 rounded-xl bg-slate-50 px-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-[#1E60F3] shadow-sm">
                <Users className="h-8 w-8" />
              </div>
              <h2 className="text-base font-black text-slate-900">고객사의 모든 기록을 한눈에</h2>
              <p className="max-w-lg text-sm leading-relaxed text-slate-500">
                고객사 연락처, 이전 요청, 예약·운행 기록, 정기 행사, 서비스 선호사항 및 담당자 인수인계를 통합합니다.
                지금은 안전한 UI 초안이며 실제 고객 정보를 자동으로 가져오지 않습니다.
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-2 text-[11px] font-bold text-slate-500">
                <span className="rounded-full bg-white px-3 py-2"><Clock3 className="mr-1 inline h-3 w-3" /> 지난 요청</span>
                <span className="rounded-full bg-white px-3 py-2"><Users className="mr-1 inline h-3 w-3" /> 담당자</span>
                <span className="rounded-full bg-white px-3 py-2"><CalendarDays className="mr-1 inline h-3 w-3" /> 행사</span>
                <span className="rounded-full bg-white px-3 py-2"><CheckCircle2 className="mr-1 inline h-3 w-3" /> 선호사항</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
