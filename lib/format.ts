// lib/format.ts
//
// Everything in this app is Asia/Kolkata. The server may not be, so never
// rely on the machine's local timezone — always pass the zone explicitly.

const IST = "Asia/Kolkata";

export function time(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: IST,
  }).format(d);
}

export function date(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: IST,
  }).format(d);
}

export function dateTime(d: Date): string {
  return `${date(d)}, ${time(d)}`;
}

// Indian digit grouping: 1,00,000 not 100,000.
export function rupees(n: number | string): string {
  const value = typeof n === "string" ? Number(n) : n;

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

// Start and end of today in IST, as UTC Dates for querying.
export function todayRange(): { start: Date; end: Date } {
  const now = new Date();

  const istNow = new Date(
    now.toLocaleString("en-US", { timeZone: IST })
  );

  const start = new Date(istNow);
  start.setHours(0, 0, 0, 0);

  const end = new Date(istNow);
  end.setHours(23, 59, 59, 999);

  // Convert the IST wall-clock boundaries back to real instants.
  const offsetMs = istNow.getTime() - now.getTime();

  return {
    start: new Date(start.getTime() - offsetMs),
    end: new Date(end.getTime() - offsetMs),
  };
}

export function age(dob: Date | null, fallback: number | null): string {
  if (dob) {
    const diff = Date.now() - dob.getTime();
    return `${Math.floor(diff / 31557600000)}y`;
  }
  return fallback ? `${fallback}y` : "—";
}
