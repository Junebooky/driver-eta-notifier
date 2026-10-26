'use client';

import React, { useState } from 'react';
import {
  Building2,
  Search,
  UserRound,
  CalendarDays,
  ClipboardList,
  StickyNote,
} from 'lucide-react';

type ViewProps = {
  search: string;
  onSearchChange: (value: string) => void;
};

// UI prototype only. No company records or customer data are read or saved here.
export function HqCustomersView({ search, onSearchChange }: ViewProps) {
  const [showExample, setShowExample] = useState(false);
  const matchesExample = !search.trim() || '샘플 고객사 A'.includes(search.trim());
  const showProfile = showExample && matchesExample;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900">고객 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            담당자, 지난 요청, 행사, 메모를 한눈에 확인하세요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowExample((visible) => !visible)}
          aria-pressed={showExample}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-[#1E60F3] hover:bg-blue-50"
        >
          {showExample ? '샘플 닫기' : '샘플 보기'}
        </button>
      </header>

      <p role="status" className="text-xs text-slate-500">
        고객 데이터 미연동 · 현재는 화면 예시이며 실제 고객 정보는 표시되지 않습니다.
      </p>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <section aria-label="고객사 목록" className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">고객사</h2>
            <span className="text-xs text-slate-400">{showExample ? '샘플 1' : '0'}</span>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="고객사 검색"
              aria-label="고객사 검색"
              className="w-full min-w-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
          </label>
          {showProfile ? (
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-blue-50 px-3 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#1E60F3]">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">샘플 고객사 A</p>
                <p className="text-xs text-slate-500">예시 · 실제 데이터 아님</p>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center">
              <Building2 className="mx-auto h-7 w-7 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                {search.trim() ? '검색 결과가 없습니다' : '등록된 고객사가 없습니다'}
              </p>
            </div>
          )}
        </section>

        <section aria-label="고객사 상세" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          {showProfile ? (
            <>
              <div className="border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-slate-900">샘플 고객사 A</h2>
                  <span className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-bold text-[#1E60F3]">샘플</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">고객사 기본 정보</p>
              </div>

              <div className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <UserRound className="h-4 w-4 text-[#1E60F3]" /> 담당자
                  </h3>
                  <p className="mt-3 text-sm text-slate-700">고객사 담당자 · 미등록</p>
                  <p className="mt-1 text-xs text-slate-500">내부 담당 · HQ 관리자 (예시)</p>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <CalendarDays className="h-4 w-4 text-[#1E60F3]" /> 행사
                  </h3>
                  <p className="mt-3 text-sm text-slate-700">임원 방문 (예시)</p>
                  <p className="mt-1 text-xs text-slate-500">일정 미등록</p>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <ClipboardList className="h-4 w-4 text-[#1E60F3]" /> 지난 요청
                  </h3>
                  <p className="mt-3 text-sm text-slate-700">공항 픽업 차량 문의 (예시)</p>
                  <p className="mt-1 text-xs text-slate-500">행사 이동 시간 변경 (예시)</p>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <StickyNote className="h-4 w-4 text-[#1E60F3]" /> 메모
                  </h3>
                  <p className="mt-3 text-sm text-slate-700">영문 안내자료 요청 (예시)</p>
                  <p className="mt-1 text-xs text-slate-500">실제 기록은 별도 연동 후 표시</p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
              <Building2 className="h-9 w-9 text-slate-300" />
              <h2 className="text-sm font-bold text-slate-800">고객사 정보</h2>
              <p className="max-w-sm text-sm leading-relaxed text-slate-500">
                고객사를 선택하면 담당자, 지난 요청, 행사, 메모가 표시됩니다.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
