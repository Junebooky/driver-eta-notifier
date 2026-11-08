'use client';

import { X } from 'lucide-react';

/** Shared, neutral A-plan feedback for operations that actually failed/succeeded.
 * The parent owns the message lifecycle; this component never invents success.
 */
export interface HqInlineFeedbackProps {
  message: string | null | undefined;
  tone?: 'error' | 'info' | 'success';
  onDismiss?: () => void;
  className?: string;
}

export function HqInlineFeedback({
  message, tone = 'error', onDismiss, className = '',
}: HqInlineFeedbackProps) {
  if (!message) return null;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start justify-between gap-3 rounded-[13px] px-3.5 py-3 text-[12px] font-medium leading-relaxed
        ${tone === 'error' ? 'bg-[#FBF4F3] text-[#A85C54]' : 'bg-[#F5F7FB] text-[#596E89]'} ${className}`}
    >
      <span className="min-w-0 break-words">{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="안내 닫기"
          className="shrink-0 rounded-[8px] p-1 text-current opacity-70 transition-opacity hover:opacity-100">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
