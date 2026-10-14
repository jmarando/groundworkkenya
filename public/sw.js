// Groundwork's background file (a service worker): keeps the app's files on the
// phone so the installed app opens with no signal. Pages come from the network
// first, with a copy of the offline pages kept for no signal; the app's files
// (whose names never change once released) come from the phone first; brand
// files, ward shapes, house counts and fonts are kept and refreshed in the
// background. Nothing else is touched: server functions, Supabase, house tiles
// and map tiles go straight to the network and are never stored, so no data
// response ever lands here. See docs/superpowers/specs/2026-10-14-installable-offline-app-design.md.

const VERSION = "v1";
const PAGES = `gw-pages-${VERSION}`;
const FILES = `gw-files-${VERSION}`;
const REFRESH = `gw-refresh-${VERSION}`;
/** The pages that work with no signal; src/lib/offline/screens.ts lists the same. */
const OFFLINE_PAGES = ["/home", "/field", "/diary", "/voters", "/elections", "/strategy"];
/** Kept at install, with the app files they name, so the first offline open works. */
const START_PAGES = ["/home", "/field"];
const OFFLINE = "/offline.html";
const MAX_FILES = 300;
/** How long a page with a kept copy waits for the network: a weak signal shows the copy instead. */
const PAGE_WAIT_MS = 4000;
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];
const REFRESHED =
  /^\/(brand\/|geo\/|tiles\/[^/]+\.json$|favicon\.ico$|site\.webmanifest$|field\.webmanifest$)/;

/** What a request is: "page", "file", "refresh", or "network" (left alone). */
function kindOf(request, origin) {
  if (request.method !== "GET" || request.headers.has("range")) return "network";
  const url = new URL(request.url);
  if (url.origin === origin) {
    if (request.mode === "navigate") return "page";
    if (url.pathname.startsWith("/assets/")) return "file";
    if (REFRESHED.test(url.pathname)) return "refresh";
    return "network";
  }
  return FONT_HOSTS.includes(url.hostname) ? "refresh" : "network";
}

/** The app files a page names. */
function assetsIn(html) {
  return [
    ...new Set(html.match(/\/assets\/[A-Za-z0-9_.-]+\.(?:js|css|woff2?|png|svg|webp)/g) ?? []),
  ];
}

/**
 * From the network first; a copy of an offline page is kept for no signal. With
 * a kept copy, a network that hasn't answered in PAGE_WAIT_MS gets the copy shown
 * instead, while the fresh page is still kept for next time.
 */
async function page(request, wait) {
  const path = new URL(request.url).pathname;
  const keep = OFFLINE_PAGES.includes(path);
  const pages = await caches.open(PAGES);
  const fresh = fetch(request).then(async (response) => {
    if (keep && response.ok) await pages.put(path, response.clone());
    return response;
  });
  const kept = keep ? await pages.match(path) : undefined;
  if (kept) {
    wait(fresh.catch(() => undefined));
    const slow = new Promise((resolve) => setTimeout(() => resolve(kept), PAGE_WAIT_MS));
    return Promise.race([fresh, slow]).catch(() => kept);
  }
  try {
    return await fresh;
  } catch {
    return (await pages.match(OFFLINE)) || Response.error();
  }
}

/** The oldest kept files beyond the limit go. */
async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_FILES))) await cache.delete(key);
}

/** From the phone first; fetched and kept when missing. */
async function file(request) {
  const files = await caches.open(FILES);
  const kept = await files.match(request);
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok) {
    await files.put(request, response.clone());
    await trim(files);
  }
  return response;
}

/** The kept copy at once, refreshed in the background; fetched and kept when missing. */
async function refresh(request, wait) {
  const cache = await caches.open(REFRESH);
  const kept = await cache.match(request);
  const fresh = fetch(request).then(
    async (response) => {
      if (response.ok || response.type === "opaque") await cache.put(request, response.clone());
      return response;
    },
    () => kept || Response.error(),
  );
  if (!kept) return fresh;
  wait(fresh);
  return kept;
}

/** Keeps the offline page and the start pages with their app files; a failure skips that one. */
async function install() {
  const pages = await caches.open(PAGES);
  const files = await caches.open(FILES);
  for (const path of [OFFLINE, ...START_PAGES]) {
    try {
      const response = await fetch(path, { credentials: "same-origin" });
      if (!response.ok) continue;
      const html = await response.text();
      // Kept as a plain copy: one reached by a redirect (a host may send /offline.html
      // to /offline) can't answer a page request.
      const { status, statusText, headers } = response;
      await pages.put(path, new Response(html, { status, statusText, headers }));
      for (const asset of assetsIn(html)) {
        if (await files.match(asset)) continue;
        const kept = await fetch(asset);
        if (kept.ok) await files.put(asset, kept);
      }
    } catch {
      // No signal for this one: it's kept on a later visit.
    }
  }
}

/** Older versions' stores go; open pages come under this file at once. */
async function activate() {
  const current = [PAGES, FILES, REFRESH];
  for (const name of await caches.keys())
    if (name.startsWith("gw-") && !current.includes(name)) await caches.delete(name);
  await self.clients.claim();
}

self.gw = { kindOf, assetsIn, page, file, refresh, install, activate, OFFLINE_PAGES, MAX_FILES };

self.addEventListener("install", (event) => {
  event.waitUntil(install().then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(activate());
});
self.addEventListener("fetch", (event) => {
  const kind = kindOf(event.request, self.location.origin);
  if (kind === "network") return;
  event.respondWith(
    kind === "page"
      ? page(event.request, (p) => event.waitUntil(p))
      : kind === "file"
        ? file(event.request)
        : refresh(event.request, (p) => event.waitUntil(p)),
  );
});
