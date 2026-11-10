'use client';
import { Fragment, useEffect, useMemo, useRef } from 'react';
import { findEmailSourceRanges } from '@/utils/emailWorkflowReview';

/** Safe text-only evidence viewer, shared by extraction/review surfaces. Never renders sender HTML. */
export function HqSourceText({ text, query, revision = 0 }: { text: string; query: string; revision?: number }) {
  const root = useRef<HTMLDivElement>(null);
  const ranges = useMemo(() => findEmailSourceRanges(text, query), [text, query]);
  useEffect(() => {
    const mark = root.current?.querySelector<HTMLElement>('mark');
    if (!mark) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    mark.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' });
    mark.focus({ preventScroll: true });
  }, [ranges, revision]);
  return <div ref={root} aria-label="이메일 원문">
    {ranges.map((range, index) => {
      const before = text.slice(index === 0 ? 0 : ranges[index - 1].end, range.start);
      return <Fragment key={`${revision}:${range.start}`}>
        {before}<mark className="hq-ui-source-match" tabIndex={-1} aria-label={`고객 제공 주소 원문 일치 ${index + 1}`}>{text.slice(range.start, range.end)}</mark>
      </Fragment>;
    })}
    {text.slice(ranges.at(-1)?.end || 0)}
  </div>;
}
