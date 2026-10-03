"use client";

// The only client component in the app. window.print() has no server-side
// equivalent, so this one button is worth the kilobyte.

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-ink)]"
    >
      {label}
    </button>
  );
}
