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

export const stampName = (base: string) => `${base}-${new Date().toISOString().slice(0, 10)}.csv`;

/**
 * Read a CSV file into rows of strings. Copes with what spreadsheets actually
 * export: quoted fields containing commas and line breaks, doubled quotes,
 * CRLF line endings, Excel's byte-order mark, and semicolon-separated files
 * from locales where the comma is the decimal separator.
 */
export function parseCSV(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const delim =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === "") {
      quoted = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Blank lines (often trailing) carry nothing.
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}
