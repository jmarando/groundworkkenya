// Was the agent at the door? The database checks each door visit against where its house is
// (schema 45: at the door, nearby, far away, no position) and counts each person's day; this
// says those counts in words for the office. Pure.

export type FieldDay = {
  userId: string;
  name: string;
  workDate: string;
  doors: number;
  atDoor: number;
  near: number;
  far: number;
  noGps: number;
  /** Doors whose house has no known position, so the visit can't be checked. */
  unchecked: number;
  /** Recorded under 20 seconds after the one before. */
  quick: number;
  /** Reached Groundwork more than 12 hours after it was said to happen. */
  late: number;
  firstAt: string | null;
  lastAt: string | null;
  ward: string | null;
  held: boolean;
  reasons: string[];
};

const REASONS: Record<string, string> = {
  far: "a quarter or more of the doors were recorded far from the house",
  no_gps: "a quarter or more of the doors had no position",
  far_or_no_gps: "a quarter or more of the doors were far from the house or had no position",
  quick: "over half the doors were recorded within 20 seconds of the one before",
  late: "over half the doors reached Groundwork more than 12 hours after they were said to happen",
};

/** Why a day is held, in words: "far …; quick …". Unknown codes are left out. */
export function reasonWords(codes: string[] | string | null | undefined): string {
  const list = Array.isArray(codes) ? codes : String(codes ?? "").split(",");
  return list
    .map((c) => REASONS[c.trim()])
    .filter(Boolean)
    .join("; ");
}

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

/** "9 of 12 at the door (75%)", counting only the doors that could be checked. */
export function atDoorLine(d: Pick<FieldDay, "doors" | "atDoor" | "unchecked">): string {
  const checked = d.doors - d.unchecked;
  if (!checked) return "Not checked: these houses have no position on file";
  return `${d.atDoor} of ${checked} at the door (${pct(d.atDoor, checked)}%)`;
}

const clock = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Nairobi",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(iso))
    : null;

/** "08:40–13:05", Nairobi time; one time when there was one door. */
export function hoursLine(d: Pick<FieldDay, "firstAt" | "lastAt">): string {
  const a = clock(d.firstAt);
  const b = clock(d.lastAt);
  if (!a) return "—";
  return !b || a === b ? a : `${a}–${b}`;
}

/** A day's verdict: what the office sees first. */
export function verdict(d: Pick<FieldDay, "held" | "reasons">): {
  tone: "ok" | "check";
  text: string;
} {
  return d.held
    ? { tone: "check", text: `Check: ${reasonWords(d.reasons) || "the doors don't add up"}.` }
    : { tone: "ok", text: "Looks right." };
}

/** The rows from field_day_checks, read with care. */
export function fieldDays(rows: unknown): FieldDay[] {
  if (!Array.isArray(rows)) return [];
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return rows.flatMap((r) => {
    if (!r || typeof r !== "object") return [];
    const o = r as Record<string, unknown>;
    if (typeof o["user_id"] !== "string" || typeof o["work_date"] !== "string") return [];
    return [
      {
        userId: o["user_id"],
        name: typeof o["name"] === "string" && o["name"] ? o["name"] : "Agent",
        workDate: o["work_date"],
        doors: n(o["doors"]),
        atDoor: n(o["at_door"]),
        near: n(o["near"]),
        far: n(o["far"]),
        noGps: n(o["no_gps"]),
        unchecked: n(o["unchecked"]),
        quick: n(o["quick"]),
        late: n(o["late"]),
        firstAt: typeof o["first_at"] === "string" ? o["first_at"] : null,
        lastAt: typeof o["last_at"] === "string" ? o["last_at"] : null,
        ward: typeof o["ward"] === "string" ? o["ward"] : null,
        held: o["held"] === true,
        reasons: Array.isArray(o["reasons"]) ? o["reasons"].map(String) : [],
      },
    ];
  });
}
