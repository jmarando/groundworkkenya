// Keeping page data for no signal: put the person's saved queries back into the
// query cache when the app starts (old, so they refresh as soon as there is
// signal), then save each listed query as it loads. Another person, another
// campaign or another format clears what was saved. The storage is handed in,
// so this runs in tests with a stand-in.

import type { QueryClient } from "@tanstack/react-query";

import {
  campaignOf,
  idOf,
  isSaved,
  keptForm,
  listsToForget,
  restorable,
  SAVED_VERSION,
  type SavedEntry,
  type Who,
} from "@/lib/offline/saved";

export type OfflineStore = {
  readWho(): Promise<Who | null>;
  writeWho(who: Who): Promise<void>;
  all(): Promise<SavedEntry[]>;
  put(entry: SavedEntry): Promise<void>;
  remove(ids: string[]): Promise<void>;
  clear(): Promise<void>;
};

/**
 * Puts the person's saved queries back, then saves each listed query as it
 * loads (at most once every `wait` ms per query). Returns a function that stops
 * saving and resolves once any save under way has finished.
 */
export async function startSaving(
  queryClient: QueryClient,
  store: OfflineStore,
  userId: string,
  { now = Date.now, wait = 1000 }: { now?: () => number; wait?: number } = {},
): Promise<() => Promise<void>> {
  let who = await store.readWho();
  if (!who || who.version !== SAVED_VERSION || who.userId !== userId) {
    await store.clear();
    who = { userId, campaignId: null, version: SAVED_VERSION };
    await store.writeWho(who);
  } else {
    const { keep, drop } = restorable(await store.all(), now());
    if (drop.length) await store.remove(drop);
    for (const e of keep)
      if ((queryClient.getQueryState(e.key)?.dataUpdatedAt ?? 0) < e.updatedAt) {
        queryClient.setQueryData(e.key, e.data, { updatedAt: e.updatedAt });
        // Marked old whatever a page's staleTime, so the first page to use it with signal refreshes it.
        void queryClient.invalidateQueries({ queryKey: e.key, exact: true, refetchType: "none" });
      }
  }

  // Writes run one at a time, so a clear never races a save.
  let chain: Promise<void> = Promise.resolve();
  const run = (job: () => Promise<void>) => {
    chain = chain.then(job, job).catch(() => undefined);
  };
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  // The lists out with this person loaded: the copy of a list that has ended, or was given to
  // someone else, goes from the phone's storage and the cache, and any save of it still waiting.
  const forgetEnded = (lists: unknown) => {
    const active = (Array.isArray(lists) ? lists : []).flatMap((l: { id?: unknown }) =>
      typeof l?.id === "string" ? [l.id] : [],
    );
    for (const q of queryClient.getQueryCache().findAll({ queryKey: ["walk-list-doors"] })) {
      if (active.includes(String(q.queryKey[1]))) continue;
      const doorsId = idOf(q.queryKey);
      clearTimeout(timers.get(doorsId));
      timers.delete(doorsId);
      queryClient.removeQueries({ queryKey: q.queryKey, exact: true });
    }
    run(async () => {
      const gone = listsToForget(await store.all(), active);
      if (gone.length) await store.remove(gone);
    });
  };

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    const { queryKey, state } = event.query;
    if (!isSaved(queryKey)) return;
    if (queryKey[0] === "my-walk-lists") forgetEnded(state.data);
    const id = idOf(queryKey);
    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        const entry: SavedEntry = {
          id,
          key: queryKey,
          data: keptForm(queryKey, state.data),
          updatedAt: state.dataUpdatedAt,
        };
        run(async () => {
          if (queryKey[0] === "my-access") {
            const campaignId = campaignOf(state.data);
            if (who!.campaignId !== null && campaignId !== who!.campaignId) await store.clear();
            if (campaignId !== who!.campaignId) {
              who = { userId, campaignId, version: SAVED_VERSION };
              await store.writeWho(who);
            }
          }
          await store.put(entry);
        });
      }, wait),
    );
  });

  return () => {
    unsubscribe();
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    return chain;
  };
}

/** When the saved pages' data last loaded: the newest among those in the cache; 0 for none. */
export function lastLoaded(queryClient: QueryClient): number {
  let newest = 0;
  for (const q of queryClient.getQueryCache().getAll())
    if (isSaved(q.queryKey) && q.state.dataUpdatedAt > newest) newest = q.state.dataUpdatedAt;
  return newest;
}
