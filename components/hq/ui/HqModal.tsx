'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { HqIconButton } from './index';

/**
 * Reusable accessible HQ dialog. Callers keep all domain state and API handlers.
 * Use only as modules are migrated; existing special-purpose/stacked dialogs
 * should not be replaced without testing their focus and scroll behavior.
 */
export interface HqModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  className?: string;
}
const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function HqModal({ isOpen, title, subtitle, icon, children, footer, onClose, className = '' }: HqModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!isOpen || !mounted) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const targets = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(element => element.getClientRects().length > 0);
      if (!targets.length) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      previouslyFocused?.focus();
    };
  }, [isOpen, mounted, onClose]);

  if (!mounted || !isOpen) return null;
  return createPortal(
    <div
      className="hq-ui-modal-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={"hq-ui-modal-surface flex w-full max-w-xl flex-col outline-none " + className}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 bg-white px-5 py-5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {icon}
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-[19px] font-bold tracking-[-0.03em] text-[#17233B]">{title}</h2>
              {subtitle && <p className="mt-1 text-[12px] font-medium text-[#73839D]">{subtitle}</p>}
            </div>
          </div>
          <HqIconButton variant="subtle" aria-label="닫기" onClick={onClose}>
            <X className="size-4" />
          </HqIconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">{children}</div>
        {footer && <div className="flex shrink-0 items-center justify-end gap-2 bg-white px-5 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
