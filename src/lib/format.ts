export function formatMoney(value: number | null | undefined, currency = "LKR") {
  const n = Number(value ?? 0);
  return `${currency} ${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDate(d)} ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string = todayISO()) {
  const a = new Date(from + "T00:00:00");
  const b = new Date(to + "T00:00:00");
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

export function freshness(dateReceived: string, shelfLifeDays: number) {
  const days = daysBetween(dateReceived);
  const ratio = days / Math.max(1, shelfLifeDays);
  if (ratio >= 1) return { label: "Discard Soon", tone: "danger" as const, days };
  if (ratio >= 0.66) return { label: "Aging", tone: "warning" as const, days };
  return { label: "Fresh", tone: "success" as const, days };
}
