import React from 'react';
import type { RouteWaypointItem } from '@/types/emailHq';

export interface DispatchRouteTimelineProps {
  waypoints: RouteWaypointItem[];
  className?: string;
  heading?: string;
  compact?: boolean;
}

/**
 * Shared, ordered, read-only route representation for HQ and driver.
 * Do not collapse intermediate stops into a single origin → destination leg.
 * Every stop's name/time/address comes from the persisted schedule metadata.
 */
export function DispatchRouteTimeline({
  waypoints, className = '', heading = '운행 경로', compact = false,
}: DispatchRouteTimelineProps) {
  const points = [...waypoints].sort((a, b) => a.order - b.order);
  if (points.length < 2) return null;

  return (
    <section className={className} aria-label={`${heading} · 총 ${points.length}곳`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-slate-800">{heading}</h4>
        <span className="text-xs text-slate-400 font-medium">총 {points.length}곳 · 경유 {Math.max(0, points.length - 2)}곳</span>
      </div>
      <div className="relative ml-1 space-y-2">
        {/* Continuous line between first and last stop */}
        <div className="absolute left-[7px] top-2.5 bottom-2.5 w-[1.5px] bg-slate-200" />
        {points.map((point, index) => {
          const first = index === 0;
          const last = index === points.length - 1;
          return (
            <div key={`${point.id}-${index}`} className={`relative flex items-start pl-6 ${compact ? 'py-1' : 'py-1.5'}`}>
              {first ? (
                <img
                  src="/images/icons/driver_ui/icon_origin.png"
                  alt="출발"
                  className="absolute left-0 top-0.5 h-4 w-4 object-contain z-10 shrink-0"
                />
              ) : last ? (
                <img
                  src="/images/icons/driver_ui/icon_destination.png"
                  alt="종료"
                  className="absolute left-0 top-0.5 h-4 w-4 object-contain z-10 shrink-0"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="absolute left-[3px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-400 ring-2 ring-white z-10 shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5">
                  <time className="w-12 shrink-0 text-xs font-bold tabular-nums text-slate-900" dateTime={point.time || undefined}>
                    {point.time || '--:--'}
                  </time>
                  <span className="min-w-0 break-words text-xs sm:text-[13px] font-bold text-slate-900">
                    {point.location || '장소 미지정'}
                  </span>
                  {first && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#1E60F3] border border-blue-100/80">
                      출발
                    </span>
                  )}
                  {last && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                      종료
                    </span>
                  )}
                </div>
                {point.address && (
                  <p className="mt-0.5 break-words pl-[58px] text-[11px] leading-relaxed text-slate-500 font-medium">
                    {point.address}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
