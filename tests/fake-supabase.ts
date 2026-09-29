// An in-memory stand-in for the Supabase client, for tests of server code
// that runs with the service role. Rows are kept per table and filters are
// applied for real. Inserts get a campaign the way the database's
// stamp_campaign trigger gives them one: from the row itself, else from its
// person, conversation, poll or ward, else the campaign that owns the
// channels. Nothing leaves this process.

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;
type Result = { data: unknown; error: { code?: string; message: string } | null; count?: number };

/** The campaign that owns the shared SMS, WhatsApp and USSD channels. */
export const CHANNEL_CAMPAIGN = "camp-channel";

/** Unique keys, as in the database. */
const UNIQUE: Record<string, string[]> = { people: ["campaign_id", "phone"] };

const PARENTS: [string, string][] = [
  ["person_id", "people"],
  ["conversation_id", "conversations"],
  ["poll_id", "polls"],
  ["ward_id", "wards"],
];

let seq = 0;

export function fakeSupabase(
  seed: Record<string, Row[]> = {},
  rpcs: Record<string, (args: Row) => unknown> = {},
) {
  const tables: Record<string, Row[]> = {
    campaigns: [{ id: CHANNEL_CAMPAIGN, owns_channels: true, created_at: "2026-01-01T00:00:00Z" }],
  };
  for (const [t, rows] of Object.entries(seed)) tables[t] = rows.map((r) => ({ ...r }));
  const rows = (t: string) => (tables[t] ??= []);

  const stamp = (r: Row): unknown => {
    if (r["campaign_id"]) return r["campaign_id"];
    for (const [col, table] of PARENTS) {
      const parent = r[col] ? rows(table).find((x) => x["id"] === r[col]) : undefined;
      if (parent?.["campaign_id"]) return parent["campaign_id"];
    }
    return CHANNEL_CAMPAIGN;
  };

  function from(table: string) {
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row[] = [];
    let patch: Row = {};
    const filters: Filter[] = [];
    const orders: { col: string; asc: boolean }[] = [];
    let limit: number | null = null;
    let single: "one" | "maybe" | null = null;
    let returning = false;
    let head = false;
    let counting = false;

    const shape = (out: Row[]): Result => {
      if (counting && head) return { data: null, count: out.length, error: null };
      if (single === "one") {
        return out.length === 1
          ? { data: out[0], error: null }
          : { data: null, error: { message: `expected one row, got ${out.length}` } };
      }
      if (single === "maybe") return { data: out[0] ?? null, error: null };
      return { data: out, error: null, ...(counting ? { count: out.length } : {}) };
    };

    const run = (): Result => {
      if (op === "insert") {
        const out: Row[] = [];
        for (const p of payload) {
          const r: Row = { id: `id-${++seq}`, created_at: new Date().toISOString(), ...p };
          if (table !== "campaigns") r["campaign_id"] = stamp(r);
          const keys = UNIQUE[table];
          if (keys && rows(table).some((x) => keys.every((k) => x[k] === r[k]))) {
            return { data: null, error: { code: "23505", message: "duplicate key value" } };
          }
          out.push(r);
        }
        rows(table).push(...out);
        return returning ? shape(out) : { data: null, error: null };
      }
      let hit = rows(table).filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        for (const r of hit) Object.assign(r, patch);
        if (!returning) return { data: null, error: null };
      }
      if (op === "delete") {
        tables[table] = rows(table).filter((r) => !hit.includes(r));
        if (!returning) return { data: null, error: null };
      }
      for (const o of [...orders].reverse()) {
        hit = [...hit].sort((a, b) => {
          const x = String(a[o.col] ?? "");
          const y = String(b[o.col] ?? "");
          return (x < y ? -1 : x > y ? 1 : 0) * (o.asc ? 1 : -1);
        });
      }
      if (limit !== null) hit = hit.slice(0, limit);
      return shape(hit);
    };

    const q = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (op !== "select") returning = true;
        if (opts?.count) counting = true;
        if (opts?.head) head = true;
        return q;
      },
      insert(v: Row | Row[]) {
        op = "insert";
        payload = Array.isArray(v) ? v : [v];
        return q;
      },
      update(v: Row) {
        op = "update";
        patch = v;
        return q;
      },
      delete() {
        op = "delete";
        return q;
      },
      eq(c: string, v: unknown) {
        filters.push((r) => r[c] === v);
        return q;
      },
      neq(c: string, v: unknown) {
        filters.push((r) => r[c] !== v);
        return q;
      },
      in(c: string, vs: unknown[]) {
        filters.push((r) => vs.includes(r[c]));
        return q;
      },
      /** Only "cs" (array contains), negated: rows whose array lacks any listed value. */
      not(c: string, op: string, v: string) {
        if (op !== "cs") throw new Error(`fake not(): unsupported operator ${op}`);
        const want = v
          .replace(/^\{|\}$/g, "")
          .split(",")
          .filter(Boolean);
        filters.push((r) => {
          const have = Array.isArray(r[c]) ? (r[c] as unknown[]) : [];
          return !want.every((w) => have.includes(w));
        });
        return q;
      },
      is(c: string, v: unknown) {
        filters.push((r) => (r[c] ?? null) === v);
        return q;
      },
      gte(c: string, v: unknown) {
        filters.push((r) => String(r[c] ?? "") >= String(v));
        return q;
      },
      lt(c: string, v: unknown) {
        filters.push((r) => String(r[c] ?? "") < String(v));
        return q;
      },
      order(c: string, o?: { ascending?: boolean }) {
        orders.push({ col: c, asc: o?.ascending !== false });
        return q;
      },
      limit(n: number) {
        limit = n;
        return q;
      },
      maybeSingle() {
        single = "maybe";
        return Promise.resolve(run());
      },
      single() {
        single = "one";
        return Promise.resolve(run());
      },
      then<T>(resolve: (r: Result) => T, reject?: (e: unknown) => T) {
        return Promise.resolve(run()).then(resolve, reject);
      },
    };
    return q;
  }

  const rpc = (name: string, args: Row = {}) => {
    const fn = rpcs[name];
    return Promise.resolve(
      fn
        ? { data: fn(args), error: null }
        : { data: null, error: { message: `no function ${name}` } },
    );
  };

  return { from, rpc, tables };
}
