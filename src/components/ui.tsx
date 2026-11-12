"use client";

import { useEffect, useState } from "react";
import type {
  ButtonHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

// Small building blocks shared by every page. Colours come from the tokens
// in globals.css, sizes follow a 4 px grid.

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  // Shows that the action is running and blocks a second click.
  pending?: boolean;
};

const BUTTON_VARIANTS = {
  primary: "bg-ink text-surface hover:opacity-85",
  secondary: "border border-line-strong bg-panel text-ink hover:bg-hover",
  ghost: "text-muted hover:bg-hover hover:text-ink",
  // Quiet until hovered, so a list of rows is not a column of red.
  danger: "text-muted hover:bg-hover hover:text-danger",
};

const BUTTON_SIZES = {
  sm: "h-7 rounded-md px-2.5 text-[13px]",
  md: "h-8 rounded-lg px-3 text-[13px]",
  lg: "h-10 rounded-[10px] px-4 text-sm",
};

export function buttonClass(
  variant: keyof typeof BUTTON_VARIANTS = "secondary",
  size: keyof typeof BUTTON_SIZES = "md",
): string {
  return `inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-[background-color,opacity,transform] duration-100 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 aria-busy:cursor-progress ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]}`;
}

export function Button({
  variant = "secondary",
  size = "md",
  pending = false,
  disabled,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`${buttonClass(variant, size)} ${className}`}
      {...props}
    />
  );
}

// For actions that cannot be undone. The first click arms the button and
// changes its label, the second click within a few seconds runs the action.
export function ConfirmButton({
  label,
  confirmLabel,
  describedAs,
  pending,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  // What the action applies to, for screen readers.
  describedAs: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <Button
      variant="danger"
      size="sm"
      pending={pending}
      aria-label={`${armed ? confirmLabel : label}: ${describedAs}`}
      className={armed ? "text-danger" : ""}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirmLabel : label}
    </Button>
  );
}

const DOT_TONES = {
  neutral: "bg-faint",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
};

export type Tone = keyof typeof DOT_TONES;

// A status is a coloured dot with its label. The text carries the meaning,
// the colour only helps scanning.
export function Status({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-muted">
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${DOT_TONES[tone]}`}
      />
      {children}
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center whitespace-nowrap rounded-md border border-line px-1.5 text-[11px] font-medium text-muted">
      {children}
    </span>
  );
}

export function PageTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <header className="mb-8">
      <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.02em]">
        {title}
      </h1>
      {hint && <p className="mt-1.5 max-w-xl text-muted">{hint}</p>}
    </header>
  );
}

export function SectionHead({
  id,
  title,
  aside,
}: {
  id?: string;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-4">
      <h2 id={id} className="text-[13px] font-medium text-ink">
        {title}
      </h2>
      {aside && <span className="text-[13px] text-faint">{aside}</span>}
    </div>
  );
}

// A bordered group of rows with hairlines between them.
export function List({ children }: { children: ReactNode }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
      {children}
    </ul>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <li className="px-4 py-3.5">{children}</li>;
}

export function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4 sm:p-5">
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line-strong px-4 py-10 text-center text-muted">
      {children}
    </p>
  );
}

// Placeholder rows in the shape of a list, shown while a query loads.
export function Loading({
  rows = 3,
  lines = 2,
}: {
  rows?: number;
  lines?: 1 | 2;
}) {
  return (
    <div role="status" aria-label="Loading">
      <List>
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className="space-y-2 px-4 py-4">
            <div className="h-3 w-40 rounded bg-hover" />
            {lines === 2 && (
              <div className="h-3 w-64 max-w-full rounded bg-hover" />
            )}
          </li>
        ))}
      </List>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <p role="alert" className="text-[13px] text-danger">
      {message}
    </p>
  );
}

export function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  "block h-9 w-full rounded-lg border border-line-strong bg-panel px-3 text-sm text-ink placeholder:text-faint hover:border-faint focus-visible:border-accent focus-visible:-outline-offset-1 disabled:opacity-50";

export const textareaClass = `${inputClass} h-auto py-2 leading-5`;

// A native select with the browser arrow replaced by one that matches.
export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select
        className={`${inputClass} appearance-none pr-9 ${className}`}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-faint"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m4.5 6.25 3.5 3.5 3.5-3.5" />
      </svg>
    </span>
  );
}

// A row of choices where one is active, used as a filter.
export function Segmented<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly (readonly [Value, string])[];
  value: Value;
  onChange: (value: Value) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="no-scrollbar -mx-1 flex gap-0.5 overflow-x-auto px-1 py-1"
    >
      {options.map(([option, text]) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className="h-7 shrink-0 whitespace-nowrap rounded-md px-2.5 text-[13px] text-muted transition-colors duration-100 hover:bg-hover hover:text-ink aria-pressed:bg-hover aria-pressed:font-medium aria-pressed:text-ink"
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  label,
  disabled,
  onChange,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group relative h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors duration-150 disabled:opacity-45 aria-checked:bg-ok"
    >
      <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-knob transition-transform duration-150 group-aria-checked:translate-x-4" />
    </button>
  );
}
