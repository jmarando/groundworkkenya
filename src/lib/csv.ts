/** Small helpers to turn console tables into a CSV file the user can download. */

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

export function downloadCSV(filename: string, headers: string[], rows: unknown[][]): void {
  if (typeof window === "undefined") return;
  // BOM keeps Excel happy with Kiswahili and accented names
  const blob = new Blob(["\uFEFF" + toCSV(headers, rows)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const stampName = (base: string) =>
  `${base}-${new Date().toISOString().slice(0, 10)}.csv`;
