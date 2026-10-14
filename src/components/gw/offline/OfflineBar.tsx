import { useQueryClient } from "@tanstack/react-query";

import { useOnline } from "@/hooks/useOnline";
import { lastLoaded } from "@/lib/offline/persist";
import { lastLoadedText } from "@/lib/offline/screens";

/**
 * Across the top of every signed-in page while there's no signal. The region
 * is always there, empty with signal, so screen readers announce the change.
 */
export function OfflineBar() {
  const online = useOnline();
  const queryClient = useQueryClient();
  const when = online ? null : lastLoadedText(lastLoaded(queryClient), Date.now());
  return (
    <div className="offline-bar" role="status">
      {online
        ? null
        : when
          ? `You're offline: showing what was last loaded ${when}. Changes need signal.`
          : "You're offline. Changes need signal."}
    </div>
  );
}
