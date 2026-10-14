// The installable app: where the background file runs, which manifest a page
// names (the field app is its own install), and the browser's install offer,
// kept from the moment the page loads so a button shown later can still use it.

/** The live site, and localhost when testing asks for it (`?sw=1`); never Lovable's preview or the dev server. */
export function shouldRegister(hostname: string, search: string): boolean {
  if (hostname === "groundwork.ke" || hostname.endsWith(".groundwork.ke")) return true;
  return (
    (hostname === "localhost" || hostname === "127.0.0.1") && new URLSearchParams(search).has("sw")
  );
}

/** The field app's pages name the field app's manifest, so installing from them installs it. */
export const manifestHref = (pathname: string): string =>
  pathname === "/field" || pathname.startsWith("/field/")
    ? "/field.webmanifest?v=4"
    : "/site.webmanifest?v=4";

export type InstallKind = "prompt" | "ios" | null;

/** What to offer: the browser's install prompt, the iPhone note, or nothing when installed. */
export function installKind(o: {
  standalone: boolean;
  hasPrompt: boolean;
  userAgent: string;
  touchPoints: number;
}): InstallKind {
  if (o.standalone) return null;
  if (o.hasPrompt) return "prompt";
  const ios =
    /iPhone|iPad|iPod/.test(o.userAgent) || (/Macintosh/.test(o.userAgent) && o.touchPoints > 1);
  return ios ? "ios" : null;
}

/** The browser's install offer (Chrome, Edge, Android). */
export type InstallPrompt = Event & { prompt: () => Promise<void> };

let offer: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((l) => l());

export const installOffer = {
  get: (): InstallPrompt | null => offer,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Shows the browser's prompt; the offer is spent either way. */
  async use(): Promise<void> {
    const o = offer;
    offer = null;
    tell();
    await o?.prompt();
  },
};

let started = false;

/** Starts the background file on the live site, and keeps the install offer for later. Browser only. */
export function startInstallable(): void {
  if (typeof window === "undefined" || started) return;
  started = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    offer = event as InstallPrompt;
    tell();
  });
  window.addEventListener("appinstalled", () => {
    offer = null;
    tell();
  });
  if (!("serviceWorker" in navigator) || !shouldRegister(location.hostname, location.search))
    return;
  const register = () => void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
