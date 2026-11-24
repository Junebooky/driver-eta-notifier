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
  /** Optional compact actions beside the close control, inside the dialog header. */
  headerActions?: React.ReactNode;
  onClose: () => void;
  className?: string;
}
const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function HqModal({ isOpen, title, subtitle, icon, children, footer, headerActions, onClose, className = '' }: HqModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Callers often pass an inline onClose callback which changes while typing.
  // Keep the latest callback without restarting the focus trap on each edit.
  const onCloseRef = useRef(onClose);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!isOpen || !mounted) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Respect an input that already received autofocus during the portal commit.
    if (panelRef.current && !panelRef.current.contains(document.activeElement)) {
      panelRef.current.focus();
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
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
  }, [isOpen, mounted]);

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
        <div className={headerActions
          ? "shrink-0 bg-white px-4 py-4 sm:px-6 sm:py-5"
          : "shrink-0 bg-white px-5 py-5 sm:px-6"}>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {icon}
              <div className="min-w-0">
                <h2 id={titleId} className={
                  "font-bold tracking-[-0.03em] text-[#17233B] " +
                  (headerActions ? "text-[16px] leading-tight sm:text-[19px]" : "truncate text-[19px]")
                }>{title}</h2>
                {!headerActions && subtitle && <p className="mt-1 text-[12px] font-medium text-[#73839D]">{subtitle}</p>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {headerActions && <div role="group" aria-label="팝업 작업" className="flex items-center gap-1">
                {headerActions}
              </div>}
              <HqIconButton variant="subtle" aria-label="닫기" onClick={onClose}>
                <X className="size-4" />
              </HqIconButton>
            </div>
          </div>
          {headerActions && subtitle && <p className="mt-1.5 text-[12px] font-medium text-[#73839D]">{subtitle}</p>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-5 sm:p-6">{children}</div>
        {footer && <div className="flex shrink-0 items-center justify-end gap-2 bg-white px-5 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
