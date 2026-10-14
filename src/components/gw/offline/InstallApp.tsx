import { useRouterState } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";

import { installKind, installOffer } from "@/lib/offline/app";

/**
 * The install button: the browser's own install offer where there is one (the
 * field page's installs Groundwork Field), the Share note on iPhone and iPad,
 * nothing once the app runs installed. Browser only.
 */
export function InstallApp({ className }: { className?: string }) {
  const offer = useSyncExternalStore(installOffer.subscribe, installOffer.get, () => null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const kind = installKind({
    standalone:
      matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true,
    hasPrompt: offer !== null,
    userAgent: navigator.userAgent,
    touchPoints: navigator.maxTouchPoints,
  });
  if (kind === "ios")
    return <span className="install-note">To install: tap Share, then Add to Home Screen.</span>;
  if (kind !== "prompt") return null;
  const field = pathname === "/field" || pathname.startsWith("/field/");
  return (
    <button type="button" className={className} onClick={() => void installOffer.use()}>
      {field ? "Install Groundwork Field" : "Install the app"}
    </button>
  );
}
