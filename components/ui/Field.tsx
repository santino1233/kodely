"use client";

import { useId } from "react";
import type { ComponentProps, ReactNode } from "react";

/* `k-focus`, not a bespoke ring. These four primitives previously used
   `focus:outline-none` plus their own 4px ring — a second focus system covering
   every form control in the product, and one that REMOVED the outline the
   shared rule exists to guarantee.

   The brand border colour stays as a supplementary cue: a text field benefits
   from a second signal, and text inputs match :focus-visible on pointer focus
   too, so the outline and the border appear together either way. */
const CONTROL =
  "k-focus w-full rounded-md border border-line-mid bg-surface px-3 text-sm text-ink placeholder:text-ink-3 " +
  "transition-[border-color,box-shadow] duration-[var(--t-1)] " +
  "focus:border-brand " +
  "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-3";

/* Label, hint and error are part of the control, not siblings a caller has to
   remember to wire up: `useId` links them via aria-describedby/aria-invalid
   automatically, which is the half that always got skipped when each page
   hand-rolled its own form markup. */
function Wrapper({
  label,
  hint,
  error,
  required,
  id,
  hintId,
  errorId,
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  id: string;
  hintId: string;
  errorId: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label != null && (
        <label htmlFor={id} className="text-[0.8125rem] font-medium text-ink">
          {label}
          {required && (
            <span className="ml-1 text-danger" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {children}
      {/* Error replaces the hint rather than stacking under it — two lines of
          advice at the moment something went wrong is one too many. */}
      {error != null ? (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      ) : hint != null ? (
        <p id={hintId} className="text-xs text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type Shared = { label?: ReactNode; hint?: ReactNode; error?: ReactNode };

export function Input({ label, hint, error, className = "", ...rest }: Shared & ComponentProps<"input">) {
  const auto = useId();
  const id = rest.id ?? auto;
  return (
    <Wrapper
      label={label}
      hint={hint}
      error={error}
      required={rest.required}
      id={id}
      hintId={`${auto}-h`}
      errorId={`${auto}-e`}
    >
      <input
        {...rest}
        id={id}
        aria-invalid={error != null || undefined}
        aria-describedby={error != null ? `${auto}-e` : hint != null ? `${auto}-h` : undefined}
        className={`${CONTROL} h-9.5 ${error != null ? "border-danger" : ""} ${className}`}
      />
    </Wrapper>
  );
}

export function Textarea({
  label,
  hint,
  error,
  className = "",
  ...rest
}: Shared & ComponentProps<"textarea">) {
  const auto = useId();
  const id = rest.id ?? auto;
  return (
    <Wrapper
      label={label}
      hint={hint}
      error={error}
      required={rest.required}
      id={id}
      hintId={`${auto}-h`}
      errorId={`${auto}-e`}
    >
      <textarea
        {...rest}
        id={id}
        aria-invalid={error != null || undefined}
        aria-describedby={error != null ? `${auto}-e` : hint != null ? `${auto}-h` : undefined}
        className={`${CONTROL} resize-y py-2.5 leading-relaxed ${error != null ? "border-danger" : ""} ${className}`}
      />
    </Wrapper>
  );
}

export function Select({
  label,
  hint,
  error,
  className = "",
  children,
  ...rest
}: Shared & ComponentProps<"select">) {
  const auto = useId();
  const id = rest.id ?? auto;
  return (
    <Wrapper
      label={label}
      hint={hint}
      error={error}
      required={rest.required}
      id={id}
      hintId={`${auto}-h`}
      errorId={`${auto}-e`}
    >
      <select {...rest} id={id} className={`${CONTROL} h-9.5 cursor-pointer pr-8 ${className}`}>
        {children}
      </select>
    </Wrapper>
  );
}

/** Search input with the magnifier baked in and a real `type="search"`, so
    the browser's own clear affordance and Escape-to-clear both work. */
export function SearchInput({ className = "", ...rest }: ComponentProps<"input">) {
  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.6-3.6" />
      </svg>
      <input {...rest} type="search" className={`${CONTROL} h-9.5 pl-9`} />
    </div>
  );
}
