"use client";

// app/global-error.tsx
//
// Last resort: catches errors thrown by the root layout itself, where
// app/error.tsx cannot run. Must render its own <html> and <body>, and
// cannot use anything from globals.css reliably — so the styles here are
// inline on purpose.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          color: "#15212b",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 18, margin: 0 }}>The app could not load</h1>

          <p style={{ fontSize: 14, color: "#5d6b78", marginTop: 8 }}>
            This is usually a connection problem with the database. Nothing
            has been lost. Try again in a moment.
          </p>

          <button
            onClick={reset}
            style={{
              marginTop: 20,
              background: "#0e6b68",
              color: "white",
              border: 0,
              borderRadius: 6,
              padding: "8px 14px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>

          {error.digest && (
            <p style={{ fontSize: 12, color: "#8a97a3", marginTop: 24 }}>
              Reference {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
