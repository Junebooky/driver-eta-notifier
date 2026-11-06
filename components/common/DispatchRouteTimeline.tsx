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
        <h4 className="text-[13px] font-semibold text-slate-800">{heading}</h4>
        <span className="text-[11px] text-slate-500">총 {points.length}곳 · 경유 {Math.max(0, points.length - 2)}곳</span>
      </div>
      <ol className="relative ml-1 border-l border-slate-200">
        {points.map((point, index) => {
          const first = index === 0;
          const last = index === points.length - 1;
          return (
            <li key={`${point.id}-${index}`} className={`relative pl-5 ${compact ? 'py-1.5' : 'py-2'}`}>
              <span aria-hidden="true" className={`absolute -left-[4.5px] top-[15px] h-2 w-2 rounded-full ${first || last ? 'bg-slate-700' : 'bg-slate-300'} ring-2 ring-white`} />
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <time className="w-12 shrink-0 text-[12px] font-medium tabular-nums text-slate-500" dateTime={point.time || undefined}>
                  {point.time || '--:--'}
                </time>
                <span className="min-w-0 break-words text-[13px] font-medium text-slate-800">
                  {point.location || '장소 미지정'}
                </span>
                {(first || last) && <span className="shrink-0 text-[10px] text-slate-400">{first ? '출발' : '종료'}</span>}
              </div>
              {point.address && (
                <p className="mt-0.5 break-words pl-[60px] text-[11px] leading-relaxed text-slate-500">
                  {point.address}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
