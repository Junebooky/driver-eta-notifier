'use client';

import React, { forwardRef } from 'react';

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
}
export const HqBadge = forwardRef<HTMLSpanElement, HqBadgeProps>(function HqBadge(
  { tone = 'neutral', className, children, ...props }, ref
) {
  return <span {...props} ref={ref} data-tone={tone} className={classes('hq-ui-badge', className)}>{children}</span>;
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
  className?: string;
}
export function HqSegmentedTabs({ tabs, value, onValueChange, className, 'aria-label': ariaLabel }: HqSegmentedTabsProps) {
  const available = tabs.filter(tab => !tab.disabled);
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={classes('hq-ui-tabs', className)}
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
          className="hq-ui-tab"
        >
          <span>{tab.label}</span>
          {tab.count !== undefined && <span>{tab.count}</span>}
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
