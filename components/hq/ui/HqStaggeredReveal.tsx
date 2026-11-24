'use client';
import { Children, type ReactNode } from 'react';

/** The workflow owns first-visit history; revisit renders are immediately visible. */
export function HqStaggeredReveal({ children, animate = false, className = '' }: { children: ReactNode; animate?: boolean; className?: string }) {
  return <div className={className} data-hq-reveal={animate ? 'first-visit' : 'static'}>
    {Children.toArray(children).map((child, index) => <div key={index}
      className={animate ? 'hq-ui-reveal-item w-full' : 'w-full'}
      style={animate ? { animationDelay: `${index * 130}ms` } : undefined}>{child}</div>)}
  </div>;
}
