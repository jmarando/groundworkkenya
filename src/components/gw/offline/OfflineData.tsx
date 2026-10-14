// Keeps the listed pages' data on the phone for no signal (src/lib/offline/persist.ts):
// for the person whose sign-in is on this phone, started again when someone else
// signs in, and deleted at sign-out. Only where the background file runs, since only
// there does the app open with no signal. Tells the sign-in gate when saved data is
// back, so it doesn't ask for signal before it is.

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { OfflineDataContext } from "@/hooks/useOfflineData";
import { supabase } from "@/integrations/supabase/client";
import { shouldRegister } from "@/lib/offline/app";
import { startSaving } from "@/lib/offline/persist";
import { phoneUser } from "@/lib/offline/session";
import { idbStore } from "@/lib/offline/store";

/** How long the gate waits for saved data before going on without it. */
const READY_WAIT_MS = 3000;

export function OfflineDataProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const forgetRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    const store = shouldRegister(location.hostname, location.search) ? idbStore() : null;
    if (!store) {
      setReady(true);
      return;
    }
    const idle = async () => undefined;
    let stop: () => Promise<void> = idle;
    let wanted: string | null = null;
    // One change at a time, each once the last saving has stopped and its writes finished.
    let steps: Promise<void> = Promise.resolve();
    const change = (job: () => Promise<void>) => {
      steps = steps
        .then(async () => {
          await stop();
          stop = idle;
          await job();
        })
        .catch(() => undefined)
        .finally(() => setReady(true));
      return steps;
    };
    const saveFor = (userId: string | null) => {
      wanted = userId;
      return change(async () => {
        if (userId) stop = await startSaving(queryClient, store, userId);
      });
    };
    const forget = () => {
      wanted = null;
      return change(() => store.clear());
    };
    forgetRef.current = forget;

    const late = setTimeout(() => setReady(true), READY_WAIT_MS);
    void saveFor(phoneUser()?.id ?? null);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") void forget();
      else if (event === "SIGNED_IN" && session && session.user.id !== wanted)
        void saveFor(session.user.id);
    });
    return () => {
      clearTimeout(late);
      data.subscription.unsubscribe();
      forgetRef.current = idle;
      void change(idle);
    };
  }, [queryClient]);

  const value = useMemo(() => ({ ready, forget: () => forgetRef.current() }), [ready]);
  return <OfflineDataContext.Provider value={value}>{children}</OfflineDataContext.Provider>;
}
