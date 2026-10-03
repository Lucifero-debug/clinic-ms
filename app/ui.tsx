// app/ui.tsx
//
// Shared primitives. Keeping these in one place is what stops twelve
// slightly different button styles appearing across the app.

import Link from "next/link";

export const input =
  "w-full rounded-md border border-[var(--color-line)] px-3 py-2 text-sm placeholder:text-[var(--color-faint)] focus:border-[var(--color-accent)]";

export const label = "block text-xs font-medium text-[var(--color-muted)]";

export const btnPrimary =
  "inline-flex items-center rounded-md bg-[var(--color-accent)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-ink)]";

export const btnQuiet =
  "inline-flex items-center rounded-md border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-surface)]";

export const btnText =
  "inline-flex items-center rounded-md px-2 py-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]";

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] shadow-[var(--shadow-panel)] ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight">
          {title}
        </h1>
        {meta && (
          <p className="mt-1 text-sm text-[var(--color-muted)]">{meta}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Empty({
  children,
  href,
  cta,
}: {
  children: React.ReactNode;
  href?: string;
  cta?: string;
}) {
  return (
    <Panel className="p-10 text-center">
      <p className="text-sm text-[var(--color-muted)]">{children}</p>
      {href && cta && (
        <Link
          href={href}
          className="mt-3 inline-block text-sm font-medium text-[var(--color-accent)] underline underline-offset-2"
        >
          {cta}
        </Link>
      )}
    </Panel>
  );
}

export function Field({
  name,
  label: text,
  hint,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className={label}>
        {text}
      </label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs text-[var(--color-faint)]">{hint}</p>}
    </div>
  );
}
