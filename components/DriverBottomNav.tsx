'use client';

import { CalendarDays, House, NotebookPen } from 'lucide-react';

export type DriverTab = 'drive' | 'schedule' | 'log';

export function DriverBottomNav({
  activeTab,
  onSelect,
}: {
  activeTab: DriverTab;
  onSelect: (tab: DriverTab) => void;
}) {
  const tabs = [
    { id: 'drive' as const, label: '홈', icon: House },
    { id: 'schedule' as const, label: '스케줄', icon: CalendarDays },
    { id: 'log' as const, label: '운행일지', icon: NotebookPen },
  ];

  const renderActiveFilledIcon = (id: DriverTab) => {
    if (id === 'drive') {
      return (
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
          <path
            fill="currentColor"
            d="M2 10a2 2 0 0 1 .7-1.5l8-7a2 2 0 0 1 2.6 0l8 7A2 2 0 0 1 22 10v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z"
          />
          <path stroke="white" strokeWidth="2" strokeLinecap="round" d="M12 16v5" />
        </svg>
      );
    }

    if (id === 'schedule') {
      return (
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
          <path
            fill="currentColor"
            d="M8 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h2a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h2V3a1 1 0 0 1 1-1Z"
          />
          <path stroke="white" strokeWidth="2" strokeLinecap="round" d="M3 9.5h18" />
          <circle cx="8" cy="14" r="1.25" fill="white" />
          <circle cx="12" cy="14" r="1.25" fill="white" />
          <circle cx="16" cy="14" r="1.25" fill="white" />
          <circle cx="8" cy="18" r="1.25" fill="white" />
          <circle cx="12" cy="18" r="1.25" fill="white" />
        </svg>
      );
    }

    // id === 'log' (NotebookPen filled)
    return (
      <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
        <rect x="4" y="2" width="16" height="20" rx="2.5" fill="currentColor" />
        <path
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          d="M2 6h3M2 10h3M2 14h3M2 18h3"
        />
        <path
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.5 14.5 16.5 7.5a1.5 1.5 0 0 1 2.1 2.1l-7 7-3 .9.9-3Z"
        />
        <path stroke="white" strokeWidth="1.8" strokeLinecap="round" d="M9 8h3" />
      </svg>
    );
  };

  return (
    <nav
      aria-label="기사 메뉴"
      className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-slate-200 bg-white px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]"
    >
      <div className="grid grid-cols-3">
        {tabs.map(({ id, label, icon: Icon }) => {
          const active = id === activeTab;
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onSelect(id)}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-slate-950 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 cursor-pointer ${
                active ? 'font-bold' : 'font-medium'
              }`}
            >
              {active ? (
                renderActiveFilledIcon(id)
              ) : (
                <Icon className="h-7 w-7" strokeWidth={1.7} aria-hidden="true" />
              )}
              <span className="text-xs leading-5">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
