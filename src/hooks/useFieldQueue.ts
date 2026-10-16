// The visits waiting on the phone and how they are sent: made once for the field page, so the
// ward list and a walk list share one queue, one sync and one idea of whether there is signal.
// A visit is sent at once with signal and kept on the phone without; a refusal from the server is
// kept aside with its reason rather than blocking the rest.

import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  isNetworkError,
  mergeAfterSync,
  queueStore,
  syncQueue,
  withoutProblem,
  type KeyValue,
  type Queued,
  type QueueStore,
  type Visit,
} from "@/lib/field";
import { recordVisit } from "@/lib/field.functions";

/** localStorage, or nothing if the browser refuses it (private mode, blocked site data). */
export function storage(): KeyValue | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export type FieldQueue = ReturnType<typeof useFieldQueue>;

export function useFieldQueue() {
  const queryClient = useQueryClient();
  const record = useServerFn(recordVisit);
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [syncing, setSyncing] = useState(false);

  // Where visits wait, made on first use in the browser.
  const storeRef = useRef<QueueStore | null>(null);
  const store = useCallback(() => (storeRef.current ??= queueStore(storage())), []);

  useEffect(() => {
    setOnline(navigator.onLine);
    setQueue(store().read());
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [store]);

  // What a saved visit changes: the ward's list, the totals, and the walk lists' progress.
  const refresh = useCallback(async () => {
    for (const key of ["walk-list", "voters", "my-walk-lists", "walk-list-doors"])
      await queryClient.invalidateQueries({ queryKey: [key] });
  }, [queryClient]);

  // A ref, not state, guards the run: if the flag were a dependency, every
  // failed sync would rebuild this function and re-trigger the effect below,
  // retrying in a tight loop on a phone that says "online" but can't connect.
  const inFlight = useRef(false);
  const sync = useCallback(async () => {
    if (inFlight.current) return;
    const snapshot = store().read();
    if (!snapshot.some((q) => !q.problem)) return;
    inFlight.current = true;
    setSyncing(true);
    try {
      const { queue: left, result } = await syncQueue(snapshot, (v) => record({ data: v }));
      // Visits saved while the run was out keep their place in the queue.
      const next = mergeAfterSync(snapshot, left, store().read());
      store().write(next);
      setQueue(next);
      if (result.sent) {
        toast.success(`${result.sent} visit${result.sent === 1 ? "" : "s"} synced.`);
        await refresh();
      }
    } finally {
      inFlight.current = false;
      setSyncing(false);
    }
  }, [record, refresh, store]);

  const waiting = queue.filter((q) => !q.problem).length;
  const problems = queue.filter((q) => q.problem);

  // Send what is waiting as soon as there is signal, and keep trying.
  useEffect(() => {
    if (!online || waiting === 0) return;
    void sync();
    const t = window.setInterval(() => void sync(), 30_000);
    return () => window.clearInterval(t);
  }, [online, waiting, sync]);

  const keep = (visit: Visit) => {
    const next = [...store().read(), visit];
    const saved = store().write(next);
    setQueue(next);
    toast.success("Saved on this phone. It syncs when there is signal.", {
      description: saved
        ? undefined
        : "This browser will not keep it if the page is closed: sync before you leave.",
    });
  };

  /**
   * Send a visit, or keep it on the phone when there is no signal. Resolves to null when the visit
   * was sent or kept, and to the server's reason when it refuses the visit, so a sheet can stay
   * open with everything the agent entered.
   */
  const save = async (visit: Visit): Promise<string | null> => {
    if (!navigator.onLine) {
      keep(visit);
      return null;
    }
    try {
      const r = await record({ data: visit });
      toast.success(r.created ? `${visit.label} signed up.` : `Saved: ${visit.label}.`, {
        description: r.consentBlocked
          ? "They had replied STOP before, so consent was not recorded. They can text START to rejoin."
          : undefined,
      });
      await refresh();
      return null;
    } catch (e) {
      if (isNetworkError(e)) {
        keep(visit);
        return null;
      }
      const reason = e instanceof Error ? e.message : "Could not save the visit.";
      // Also as a toast, in case the sheet was closed while this was sending.
      toast.error(reason);
      return reason;
    }
  };

  const discard = (clientId: string) => {
    const next = store()
      .read()
      .filter((q) => q.clientId !== clientId);
    store().write(next);
    setQueue(next);
  };

  // A refusal can be a passing fault (a server error mid-sync): let the agent send it again.
  const retry = (clientId: string) => {
    const next = store()
      .read()
      .map((q) => (q.clientId === clientId ? withoutProblem(q) : q));
    store().write(next);
    setQueue(next);
  };

  return { online, queue, waiting, problems, syncing, sync, save, discard, retry };
}
