// Door-to-door numbers by ward, from each person's last contact and the door
// events: who has been seen in 30 days, who is overdue or never seen, doors
// knocked in 30 days, and what people raised when the door opened. Pure.

export type DoorPerson = { id: string; ward_id: string | null; last_contacted_at: string | null };
export type DoorEvent = {
  person_id: string;
  kind: string;
  detail: string | null;
  created_at: string;
};

export type WardDoors = {
  people: number;
  /** Seen in the last 30 days. */
  knocked: number;
  /** Doors where someone spoke, ever. */
  spoke: number;
  /** Last seen more than 30 days ago. */
  stale: number;
  never: number;
  /** Door events in the last 30 days. */
  doors30: number;
  /** What was raised where someone spoke, most first. */
  issues: { name: string; count: number }[];
};

/** Per ward id ("none" for people without a ward). */
export function doorsByWard(
  people: DoorPerson[],
  events: DoorEvent[],
  now: number,
): Map<string, WardDoors> {
  const age = (iso: string | null) => (iso ? (now - Date.parse(iso)) / 864e5 : Infinity);
  const out = new Map<string, WardDoors>();
  const issues = new Map<string, Map<string, number>>();
  const wardOf = new Map<string, string>();
  const get = (key: string) => {
    let w = out.get(key);
    if (!w) {
      w = { people: 0, knocked: 0, spoke: 0, stale: 0, never: 0, doors30: 0, issues: [] };
      out.set(key, w);
    }
    return w;
  };
  for (const p of people) {
    const key = p.ward_id ?? "none";
    wardOf.set(p.id, key);
    const w = get(key);
    w.people += 1;
    const d = age(p.last_contacted_at);
    if (d === Infinity) w.never += 1;
    else if (d <= 30) w.knocked += 1;
    else w.stale += 1;
  }
  for (const e of events) {
    const key = wardOf.get(e.person_id);
    if (!key) continue;
    const w = get(key);
    if (age(e.created_at) <= 30) w.doors30 += 1;
    if (e.kind === "door_spoke") {
      w.spoke += 1;
      if (e.detail) {
        const m = issues.get(key) ?? new Map<string, number>();
        m.set(e.detail, (m.get(e.detail) ?? 0) + 1);
        issues.set(key, m);
      }
    }
  }
  for (const [key, m] of issues) {
    get(key).issues = [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
  return out;
}
