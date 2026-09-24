// The field app's offline queue. Pure apart from the storage handed in, so
// the rules can be tested without a browser.
//
// A visit is recorded on the phone first. If the phone is online it goes
// straight up; if not, it waits here and syncs when signal returns. Only the
// visits themselves are stored — never the walk list — so a lost phone
// carries as little of the voter file as possible.

export const ISSUES = [
  "Water",
  "Rubbish",
  "Roads",
  "Lighting",
  "Bursaries",
  "Jobs",
  "Health",
  "Security",
] as const;

export type Outcome = "spoke" | "not_home" | "refused";

export type Visit = {
  /** Made on the phone; the server records each id once, however often it is sent. */
  clientId: string;
  personId: string | null;
  newPerson: {
    phone: string;
    name: string;
    ward_id: string | null;
    segment: string | null;
    language: "sw" | "en";
  } | null;
  outcome: Outcome;
  support: 1 | 2 | 3 | 4 | 5 | null;
  issue: string | null;
  consent: { sms: boolean; whatsapp: boolean; call: boolean };
  consentSource: string;
  /** When the door was knocked, not when the phone found signal. */
  visitedAt: string;
  /** Shown in the queue so the agent knows which visit is which. */
  label: string;
};

export type Queued = Visit & { problem?: string };

/** The visit without its problem note, so the next sync sends it again. */
export function withoutProblem(q: Queued): Queued {
  const copy: Queued = { ...q };
  delete copy.problem;
  return copy;
}

/** The bits of Storage the queue needs; lets tests pass a plain object. */
export type KeyValue = { getItem(k: string): string | null; setItem(k: string, v: string): void };

const KEY = "gw-field-queue-v1";

/** Storage can throw (private mode, blocked site data): never let that lose a visit silently. */
export function readQueue(store: KeyValue | undefined): Queued[] {
  try {
    const raw = store?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Queued[]) : [];
  } catch {
    return [];
  }
}

export function writeQueue(store: KeyValue | undefined, queue: Queued[]): boolean {
  try {
    store?.setItem(KEY, JSON.stringify(queue));
    return Boolean(store);
  } catch {
    return false;
  }
}

export type QueueStore = { read(): Queued[]; write(queue: Queued[]): boolean };

/**
 * Where visits wait. If the browser will not store them (private mode, full
 * storage), they are held in memory for the session instead, so they still
 * sync while the page stays open. `write` says whether the queue was stored.
 */
export function queueStore(store: KeyValue | undefined): QueueStore {
  let memory: Queued[] | null = null;
  return {
    read: () => memory ?? readQueue(store),
    write(queue) {
      if (memory === null && writeQueue(store, queue)) return true;
      memory = queue;
      return false;
    },
  };
}

/**
 * The queue to keep after a sync. The run worked on a snapshot: visits saved
 * while it was in flight are added back, and any discarded meanwhile stay gone.
 */
export function mergeAfterSync(snapshot: Queued[], left: Queued[], latest: Queued[]): Queued[] {
  const before = new Set(snapshot.map((q) => q.clientId));
  const present = new Set(latest.map((q) => q.clientId));
  return [
    ...left.filter((q) => present.has(q.clientId)),
    ...latest.filter((q) => !before.has(q.clientId)),
  ];
}

type RandomSource = { getRandomValues(array: Uint8Array): Uint8Array; randomUUID?: () => string };

/** A random id for a visit. crypto.randomUUID is missing from older phones' browsers. */
export function newVisitId(source: RandomSource = crypto): string {
  if (typeof source.randomUUID === "function") return source.randomUUID();
  const b = source.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40; // version 4
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Could not reach the server at all: keep the visit and try again later. */
export function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /failed to fetch|networkerror|load failed|network request failed|timed? ?out|offline/i.test(
    msg,
  );
}

export type SyncResult = { sent: number; waiting: number; problems: number };

/**
 * Send what is waiting, oldest first. A network failure stops the run and
 * keeps everything from that point. A refusal from the server (a bad number,
 * say) is kept aside with its reason rather than blocking every visit after it.
 */
export async function syncQueue(
  queue: Queued[],
  send: (v: Visit) => Promise<unknown>,
): Promise<{ queue: Queued[]; result: SyncResult }> {
  const remaining: Queued[] = [];
  let sent = 0;
  let stopped = false;

  for (const item of queue) {
    if (stopped || item.problem) {
      remaining.push(item);
      continue;
    }
    try {
      await send(item);
      sent++;
    } catch (e) {
      if (isNetworkError(e)) {
        stopped = true;
        remaining.push(item);
      } else {
        remaining.push({ ...item, problem: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  return {
    queue: remaining,
    result: {
      sent,
      waiting: remaining.filter((q) => !q.problem).length,
      problems: remaining.filter((q) => q.problem).length,
    },
  };
}
