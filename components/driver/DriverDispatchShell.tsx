'use client';

import React from 'react';

/**
 * Shared A-style dispatch surface.
 * The schedule tab and event favorites reuse identical card typography and spacing.
 * Operational controls remain children so the full schedule never loses features.
 */
export function DriverDispatchShell({
  title, subtitle, meta, compact = false, children,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <article className={`w-full min-w-0 overflow-hidden rounded-[16px] bg-white shadow-[0_4px_18px_rgba(35,49,78,0.045)] ${compact ? 'p-3.5' : 'p-4 sm:p-5'}`}>
      <div className="mb-3.5 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          {meta && <p className="text-[11px] font-semibold tracking-tight text-[#8290A5]">{meta}</p>}
          <h3 className={`break-words font-bold tracking-tight text-[#17233B] ${compact ? 'text-[14px]' : 'text-[16px]'}`}>{title}</h3>
          {subtitle && <p className="break-words text-[12px] leading-relaxed text-[#8290A5]">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-3.5">{children}</div>
    </article>
  );
}
