'use client';

import React, { forwardRef } from 'react';
import { Search, X } from 'lucide-react';

/**
 * HQ-only White First primitives. Visual values live in app/globals.css
 * under --hq-* and .hq-ui-* so the driver cockpit/Settings remain untouched.
 * Pass business handlers via native onClick/onChange/onSubmit; no API logic here.
 */
export type HqButtonVariant = 'primary' | 'secondary' | 'subtle' | 'ghost' | 'danger';
export type HqButtonSize = 'sm' | 'md' | 'lg';

export interface HqButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: HqButtonVariant;
  size?: HqButtonSize;
  loading?: boolean;
}

function classes(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(' ');
}

export const HqButton = forwardRef<HTMLButtonElement, HqButtonProps>(function HqButton(
  { variant = 'secondary', size = 'md', loading = false, disabled, type = 'button', className, children, ...props },
  ref
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      data-variant={variant}
      data-size={size}
      className={classes('hq-ui-button', className)}
    >
      {children}
    </button>
  );
});

export interface HqIconButtonProps extends Omit<HqButtonProps, 'children'> {
  'aria-label': string;
  children: React.ReactNode;
}
export const HqIconButton = forwardRef<HTMLButtonElement, HqIconButtonProps>(function HqIconButton(
  { className, children, ...props }, ref
) {
  return (
    <HqButton {...props} ref={ref} className={classes('hq-ui-icon-button', className)}>
      {children}
    </HqButton>
  );
});

export interface HqCardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'default' | 'muted';
}
export const HqCard = forwardRef<HTMLDivElement, HqCardProps>(function HqCard(
  { tone = 'default', className, children, ...props }, ref
) {
  return <div {...props} ref={ref} data-tone={tone} className={classes('hq-ui-card', className)}>{children}</div>;
});

export const HqInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function HqInput(
  { className, ...props }, ref
) {
  return <input {...props} ref={ref} className={classes('hq-ui-field', className)} />;
});

export interface HqSearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
  clearLabel?: string;
  containerClassName?: string;
}

export const HqSearchInput = forwardRef<HTMLInputElement, HqSearchInputProps>(function HqSearchInput(
  { type = 'search', onClear, clearLabel = '검색어 지우기', value, className, containerClassName, ...props },
  ref
) {
  const hasValue = typeof value === 'string' ? value.length > 0 : Boolean(value);
  return (
    <div className={classes('relative min-w-0', containerClassName)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#95A3B9]"
      />
      <input
        {...props}
        ref={ref}
        type={type}
        value={value}
        className={classes(
          'hq-ui-search-input h-12 sm:h-11 w-full rounded-[14px] bg-white pl-10 text-[15px] sm:text-[14px] font-medium text-[#17233B] outline-none placeholder:text-[14px] sm:placeholder:text-[14px] placeholder:text-[#95A3B9]',
          onClear && hasValue ? 'pr-9' : 'pr-3.5',
          className
        )}
      />
      {onClear && hasValue && (
        <button
          type="button"
          onClick={onClear}
          aria-label={clearLabel}
          className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-[#95A3B9] transition-colors hover:bg-slate-100 hover:text-[#4D607C] cursor-pointer"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
});
export const HqSelect = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function HqSelect(
  { className, children, ...props }, ref
) {
  return <select {...props} ref={ref} className={classes('hq-ui-field', className)}>{children}</select>;
});
export const HqTextarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function HqTextarea(
  { className, ...props }, ref
) {
  return <textarea {...props} ref={ref} className={classes('hq-ui-field', 'hq-ui-textarea', className)} />;
});

export interface HqBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'selected' | 'warning' | 'critical';
  wrap?: boolean;
}
export const HqBadge = forwardRef<HTMLSpanElement, HqBadgeProps>(function HqBadge(
  { tone = 'neutral', wrap = false, className, children, ...props }, ref
) {
  return <span {...props} ref={ref} data-tone={tone} data-wrap={wrap || undefined} className={classes('hq-ui-badge', className)}>{children}</span>;
});

export interface HqTabOption {
  id: string;
  label: React.ReactNode;
  count?: number;
  disabled?: boolean;
}
export interface HqSegmentedTabsProps {
  tabs: readonly HqTabOption[];
  value: string;
  onValueChange: (value: string) => void;
  'aria-label': string;
  variant?: 'segmented' | 'underline';
  className?: string;
}
export function HqSegmentedTabs({
  tabs,
  value,
  onValueChange,
  variant = 'segmented',
  className,
  'aria-label': ariaLabel,
}: HqSegmentedTabsProps) {
  const available = tabs.filter(tab => !tab.disabled);
  const isUnderline = variant === 'underline';
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      data-variant={variant}
      className={classes(isUnderline ? 'hq-ui-underline-tabs' : 'hq-ui-tabs', className)}
      onKeyDown={(event) => {
        const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!direction || available.length === 0) return;
        event.preventDefault();
        const current = available.findIndex(tab => tab.id === value);
        const next = (current + direction + available.length) % available.length;
        const selected = available[next];
        onValueChange(selected.id);
        const candidate = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'))
          .find(element => element.dataset.tabId === selected.id);
        candidate?.focus();
      }}
    >
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          data-tab-id={tab.id}
          aria-selected={tab.id === value}
          tabIndex={tab.id === value ? 0 : -1}
          disabled={tab.disabled}
          onClick={() => onValueChange(tab.id)}
          className={isUnderline ? 'hq-ui-underline-tab' : 'hq-ui-tab'}
        >
          <span>{tab.label}</span>
          {tab.count !== undefined && (
            <span className={isUnderline ? 'hq-ui-underline-tab-count' : undefined}>{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export interface HqTooltipProps {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}
export function HqTooltip({ label, children, className }: HqTooltipProps) {
  return (
    <span className={classes('group relative inline-flex items-center', className)}>
      {children}
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 flex-col items-center group-hover:flex group-focus-within:flex">
        <span className="hq-ui-tooltip">{label}</span>
        <span className="hq-ui-tooltip-caret -mt-1 size-2 rotate-45" />
      </span>
    </span>
  );
}
