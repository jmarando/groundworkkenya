# The installable offline app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Groundwork installs on a phone as two apps, "Groundwork" (opening Home) and "Groundwork Field" (opening the field app), that open with no signal: the field app records doors as it does now, the listed pages show what was last loaded under an offline bar, and every other page says it needs signal.

**Architecture:** A hand-written background file, `public/sw.js` (a service worker), keeps the app's files and copies of the six offline pages and never stores a data response. The app saves the listed React Query results, with anything personal removed, in IndexedDB for the person whose sign-in is on the phone. It puts them back at start, marked old. With no signal, the signed-in area's entry check reads the sign-in stored on the phone. Pages off the list, or with nothing saved, say they need signal, and Voters and the field app say which part needs it.

**Tech Stack:** TanStack Start and Router (file routes, the root `head` with `matches`), React 19, React Query 5.101 (`onlineManager`, `setQueryData` with `updatedAt`, query cache subscriptions), Supabase JS 2.116 (auth), the browser's Cache API, IndexedDB and service workers. Tests are tsx files with `eq()`; the background file runs in `node:vm` with stand-ins. Screens are checked in the scratch preview harness.

**Spec:** `docs/superpowers/specs/2026-10-14-installable-offline-app-design.md`

## Global Constraints

- **Never on a phone:** the voter file (names, phone numbers), the recent-contacts feed, suggested walk lists, recent visits with names, house visit details, the People tab, Inbox, Finance and Broadcast.
  - `["voters"]` keeps `wards` and `totals`, with `feed` and `people` emptied.
  - `["canvassing"]` keeps `totals`, `wards`, `issues` and `unplaced`, with `walkList` and `recent` emptied.
  - `["people"]`, `["walk-list", …]` and `["house", …]` are never saved.
- **The offline pages** are exactly `/home`, `/field`, `/diary`, `/voters`, `/elections` and `/strategy`. `public/sw.js` and `src/lib/offline/screens.ts` list them the same, and a test compares the two.
- **Stores:**
  - Cache API: `gw-pages-v1`, `gw-files-v1`, `gw-refresh-v1`, with at most 300 app files.
  - IndexedDB: database `groundwork-offline` (stores `saved` and `meta`), saved format version 1, nothing older than 14 days.
- **Where it runs:** the background file registers only on `groundwork.ke` and its subdomains, or on `localhost` and `127.0.0.1` with `?sw=1`. Never in Lovable's preview or the dev server. Saving page data runs on the same hosts only.
- **No build plugin** and no change to `vite.config.ts`: Lovable's build setup stays as it is.
- **The words on screen, exactly:**
  - "You're offline: showing what was last loaded at 08:40. Changes need signal." Before today: "on 12 Oct at 08:40"; with nothing loaded: "You're offline. Changes need signal."
  - "This page needs signal"
  - "The map needs signal."
  - "The People tab needs signal."
  - "The list needs signal. You can still add someone you meet at the door."
  - "You're offline." with "Open Groundwork once with signal to use it offline."
  - "Install the app" and "Install Groundwork Field"
  - "To install: tap Share, then Add to Home Screen."
  - `/offline.html`: "You're offline." with "The field app and the pages you've opened before work without signal."
- **Timing:** a page with a kept copy waits 4 seconds for the network; the entry check waits 5 seconds for Supabase; the sign-in gate waits at most 3 seconds for saved data.
- **Tests** are tsx files in `tests/` with the `eq()` helper, ending with ``console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);``.
  - Run one at a time from the repository root with `npx tsx --tsconfig tsconfig.json tests/<file>.test.ts`.
  - Run everything with `npm test`.
- **Repository rules:**
  - Never run Prettier on `data/atlas/REPORT.md`, `src/styles/groundwork.css` or the whole of `src/styles/gw-app.css`; append to `gw-app.css` by hand.
  - Never name TransTally.
  - The repository is public, so no secrets or voter data.
  - Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Nothing is pushed without the user's OK, and the branch is kept working (AGENTS.md).

## Review Focus

1. **Hours with no signal.** The phone's stored session has an expired access token, so Supabase's own `getSession` and `getUser` report no session. The person still gets in, with their saved pages.
   - Task 3's session test pins `userIn` (an expired session still counts) and `entryUser`.
   - Task 4 wires `entryUser` into the entry check.
2. **A weak signal** (the phone says it's online, but nothing answers).
   - A kept page shows within 4 seconds: Task 1's "a slow connection" test.
   - The entry check uses the phone's sign-in after 5 seconds: Task 3's "no answer in time" test.
3. **Pages that keep their data for good** (`staleTime: Infinity`, as the map settings do). Restored data must still refresh once there's signal: Task 3's "every page refreshes it with signal" test.
4. **Signing out with no signal.** Supabase keeps the session when its sign-out can't reach the server, so the sign-out deletes the stored session and the saved data itself, and a save under way mustn't land after the delete.
   - Task 3's sign-out test: a failed sign-out deletes the phone's copy of the session.
   - Task 3's "stopping waits for a save under way" test pins the race.
5. **A host that answers `/offline.html` by way of a redirect.** Cloudflare's default sends it to `/offline`, and a redirected copy can't answer a page request, so install keeps a plain copy: Task 1's "reached by a redirect" test.

## Files

| File | What it does |
|---|---|
| `public/sw.js` | The background file: what each request is, the kept pages and files, install and activate |
| `public/offline.html` | The page for a page never kept, with no signal |
| `public/site.webmanifest`, `public/field.webmanifest` | The two installs |
| `src/lib/offline/app.ts` | Where the background file runs, each page's manifest, the install offer |
| `src/lib/offline/saved.ts` | Which queries are saved, what of each, for how long, for whom |
| `src/lib/offline/persist.ts` | Putting saved data back and saving as queries load, with the storage handed in |
| `src/lib/offline/store.ts` | IndexedDB, the phone's storage |
| `src/lib/offline/session.ts` | The sign-in kept on the phone, and who enters the signed-in area |
| `src/lib/offline/screens.ts` | Which pages open with no signal, the gate's state, the bar's time |
| `src/hooks/useOnline.ts`, `src/hooks/useOfflineData.ts`, `src/hooks/useSignOut.ts` | Signal, saved data's state, signing out on the phone |
| `src/components/gw/offline/OfflineData.tsx` | Starts and stops saving for the person on the phone |
| `src/components/gw/offline/OfflineBar.tsx`, `NeedsSignal.tsx`, `InstallApp.tsx` | The bar, "This page needs signal", the install button |
| `src/routes/__root.tsx`, `src/router.tsx` | Each page's manifest, saved data, React Query's start, the install offer |
| `src/routes/_authenticated/route.tsx` | The entry check and the gate with no signal |
| `src/components/gw/ConsoleShell.tsx` | The bar, the install button, the shared sign-out |
| `src/routes/_authenticated/voters.tsx`, `src/components/gw/FieldApp.tsx`, `src/routes/_authenticated/field.tsx` | Voters' and the field app's notes, the field page's install button |
| `src/styles/gw-app.css`, `AGENTS.md` | Styles; project notes |
| `tests/sw.test.ts`, `tests/offline-app.test.ts`, `tests/offline-saved.test.ts`, `tests/offline-session.test.ts`, `tests/offline-screens.test.ts` | The checks |

---

### Task 1: The background file and the offline page

**Files:**
- Create: `public/sw.js`
- Create: `public/offline.html`
- Test: `tests/sw.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `/sw.js`, a classic service worker. For its test it sets `self.gw`, which holds:
    - `kindOf(request, origin)`, returning `"page" | "file" | "refresh" | "network"`
    - `assetsIn(html): string[]`
    - `page(request, wait)`, `file(request)` and `refresh(request, wait)`, where `wait(promise)` is the fetch event's `waitUntil`
    - `install()` and `activate()`
    - `OFFLINE_PAGES` and `MAX_FILES`
  - The line `const OFFLINE_PAGES = ["/home", "/field", "/diary", "/voters", "/elections", "/strategy"];`, which Task 4's test reads.
  - `/offline.html`, a self-contained page that names no `/assets/` file.

- [ ] **Step 1: Write the failing test**

Create `tests/sw.test.ts`:

```ts
// Checks for the background file (public/sw.js), loaded as the browser would
// load it but with stand-ins for its cache, the network and the open pages:
// what each request is, what install keeps, pages with and without signal, the
// app files' limit, refreshing in the background, and old stores cleared.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/sw.test.ts

import { readFileSync } from "node:fs";
import vm from "node:vm";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

const ORIGIN = "https://sakaja.groundwork.ke";
type Req = { url: string; method: string; mode: string; headers: Headers };
const req = (path: string, o: { mode?: string; method?: string; range?: boolean } = {}): Req => ({
  url: new URL(path, ORIGIN).href,
  method: o.method ?? "GET",
  mode: o.mode ?? "cors",
  headers: new Headers(o.range ? { range: "bytes=0-99" } : {}),
});
const nav = (path: string) => req(path, { mode: "navigate" });

/** A cache in memory: keys are full URLs, oldest first. */
class Store {
  entries = new Map<string, Response>();
  /** Whether each kept response came through a redirect (lost when a stand-in Response is cloned). */
  redirected = new Map<string, boolean>();
  private id = (r: string | { url: string }) =>
    new URL(typeof r === "string" ? r : r.url, ORIGIN).href;
  async match(r: string | { url: string }) {
    return this.entries.get(this.id(r))?.clone();
  }
  async put(r: string | { url: string }, res: Response) {
    this.entries.delete(this.id(r));
    this.entries.set(this.id(r), res);
    this.redirected.set(new URL(this.id(r)).pathname, res.redirected);
  }
  async keys() {
    return [...this.entries.keys()].map((url) => ({ url }));
  }
  async delete(r: string | { url: string }) {
    return this.entries.delete(this.id(r));
  }
  paths() {
    return [...this.entries.keys()].map((u) => new URL(u).pathname);
  }
}
class Stores {
  named = new Map<string, Store>();
  async open(name: string) {
    if (!this.named.has(name)) this.named.set(name, new Store());
    return this.named.get(name)!;
  }
  async keys() {
    return [...this.named.keys()];
  }
  async delete(name: string) {
    return this.named.delete(name);
  }
}

type World = {
  caches: Stores;
  online: boolean;
  /** Answers arrive after 50ms, longer than the page wait (scaled from seconds to ms). */
  slow: boolean;
  routes: Record<string, { body: string; status?: number; redirected?: boolean }>;
  fetched: string[];
  /** The waits the file asked for, in ms. */
  timers: number[];
  claimed: boolean;
};

function load(w: World) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const self = {
    location: { origin: ORIGIN },
    clients: {
      claim: async () => {
        w.claimed = true;
      },
    },
    skipWaiting: async () => {},
    addEventListener: (type: string, fn: (event: unknown) => void) => (listeners[type] = fn),
    gw: undefined as unknown as Gw,
  };
  const fetchStub = async (r: string | { url: string }) => {
    const url = new URL(typeof r === "string" ? r : r.url, ORIGIN);
    w.fetched.push(url.pathname);
    if (!w.online) throw new TypeError("Failed to fetch");
    if (w.slow) await new Promise((r) => setTimeout(r, 50));
    const route = w.routes[url.pathname];
    if (!route) return new Response("missing", { status: 404 });
    const res = new Response(route.body, { status: route.status ?? 200 });
    // The host may answer /offline.html by way of a redirect to /offline.
    if (route.redirected) Object.defineProperty(res, "redirected", { value: true });
    return res;
  };
  vm.runInContext(
    readFileSync("public/sw.js", "utf8"),
    vm.createContext({
      self,
      caches: w.caches,
      fetch: fetchStub,
      Response,
      URL,
      console,
      // The browser's timer, with seconds passing as milliseconds.
      setTimeout: (fn: () => void, ms: number) => {
        w.timers.push(ms);
        return setTimeout(fn, ms / 1000);
      },
    }),
  );
  return { gw: self.gw, listeners };
}
type Gw = {
  kindOf: (r: Req, origin: string) => string;
  assetsIn: (html: string) => string[];
  page: (r: Req, wait: (p: Promise<unknown>) => void) => Promise<Response>;
  file: (r: Req) => Promise<Response>;
  refresh: (r: Req, wait: (p: Promise<Response>) => void) => Promise<Response>;
  install: () => Promise<void>;
  activate: () => Promise<void>;
  OFFLINE_PAGES: string[];
  MAX_FILES: number;
};

const world = (over: Partial<World> = {}): World => ({
  caches: new Stores(),
  online: true,
  slow: false,
  routes: {},
  fetched: [],
  timers: [],
  claimed: false,
  ...over,
});
const store = async (w: World, name: string) => (await w.caches.open(name)) as Store;
const none = () => {};

// ---------------------------------------------------------------- what each request is

{
  const { gw } = load(world());
  const kind = (r: Req) => gw.kindOf(r, ORIGIN);
  eq(
    "requests by kind",
    [
      kind(nav("/home")),
      kind(nav("/inbox?x=1")),
      kind(req("/assets/index-Ab12.js")),
      kind(req("/brand/groundwork-app-icon-192.png")),
      kind(req("/geo/nairobi-wards.json")),
      kind(req("/tiles/houses-nairobi.json")),
      kind(req("/tiles/houses-nairobi.pmtiles")),
      kind(req("/favicon.ico")),
      kind(req("/site.webmanifest")),
      kind(req("/field.webmanifest")),
      kind(req("https://fonts.gstatic.com/s/geist/v1/a.woff2")),
      kind(req("https://fonts.googleapis.com/css2?family=Geist")),
    ],
    [
      "page",
      "page",
      "file",
      "refresh",
      "refresh",
      "refresh",
      "network",
      "refresh",
      "refresh",
      "refresh",
      "refresh",
      "refresh",
    ],
  );
  eq(
    "never kept: server functions, the API, Supabase, map tiles, house tiles in ranges, writes",
    [
      kind(req("/_serverFn/abc123")),
      kind(req("/api/public/email/inbound")),
      kind(req("https://xyz.supabase.co/rest/v1/people")),
      kind(req("https://api.maptiler.com/maps/hybrid/style.json")),
      kind(req("/assets/index-Ab12.js", { range: true })),
      kind(req("/home", { mode: "navigate", method: "POST" })),
      kind(req("/sw.js")),
    ],
    ["network", "network", "network", "network", "network", "network", "network"],
  );
  eq(
    "the app files a page names",
    gw.assetsIn(
      '<link href="/assets/styles-x1.css"><script src="/assets/index-y2.js"></script><script src="/assets/index-y2.js"></script>',
    ),
    ["/assets/styles-x1.css", "/assets/index-y2.js"],
  );
}

// ---------------------------------------------------------------- install

{
  const w = world({
    routes: {
      "/offline.html": { body: "<p>offline</p>" },
      "/home": { body: '<script src="/assets/a.js"></script><link href="/assets/b.css">' },
      "/field": {
        body: '<script src="/assets/a.js"></script><script src="/assets/c.js"></script>',
      },
      "/assets/a.js": { body: "a" },
      "/assets/b.css": { body: "b" },
    },
  });
  const { gw } = load(w);
  await gw.install();
  eq(
    "install keeps the offline page and the start pages",
    (await store(w, "gw-pages-v1")).paths(),
    ["/offline.html", "/home", "/field"],
  );
  eq(
    "and the app files they name, a missing one skipped",
    (await store(w, "gw-files-v1")).paths(),
    ["/assets/a.js", "/assets/b.css"],
  );
  eq(
    "a file already kept isn't fetched twice",
    w.fetched.filter((p) => p === "/assets/a.js").length,
    1,
  );
}
{
  const w = world({ routes: { "/offline.html": { body: "<p>offline</p>", redirected: true } } });
  const { gw } = load(w);
  await gw.install();
  const pages = await store(w, "gw-pages-v1");
  eq(
    "a page reached by a redirect is kept as a plain copy, which can answer a page request",
    [pages.redirected.get("/offline.html"), await (await pages.match("/offline.html"))!.text()],
    [false, "<p>offline</p>"],
  );
}
{
  const w = world({
    routes: { "/offline.html": { body: "<p>offline</p>" }, "/home": { body: "x", status: 500 } },
  });
  const { gw } = load(w);
  await gw.install();
  eq("a page that fails isn't kept; the rest are", (await store(w, "gw-pages-v1")).paths(), [
    "/offline.html",
  ]);
}

// ---------------------------------------------------------------- pages

{
  const w = world({ routes: { "/home": { body: "home v2" }, "/inbox": { body: "inbox" } } });
  const { gw } = load(w);
  eq(
    "with signal, a page comes from the network",
    await (await gw.page(nav("/home?x=1"), none)).text(),
    "home v2",
  );
  await gw.page(nav("/inbox"), none);
  eq(
    "an offline page's copy is kept by its path; others aren't",
    (await store(w, "gw-pages-v1")).paths(),
    ["/home"],
  );
  w.online = false;
  eq(
    "with no signal, the kept copy, whatever its search part",
    await (await gw.page(nav("/home?area=x"), none)).text(),
    "home v2",
  );
  eq(
    "no copy and no offline page: an error, as without this file",
    (await gw.page(nav("/inbox"), none)).type,
    "error",
  );
  await (await store(w, "gw-pages-v1")).put("/offline.html", new Response("offline page"));
  eq(
    "no copy: the offline page",
    await (await gw.page(nav("/inbox"), none)).text(),
    "offline page",
  );
}
{
  const w = world({ routes: { "/home": { body: "broken", status: 500 } } });
  const { gw } = load(w);
  const res = await gw.page(nav("/home"), none);
  eq(
    "a failed page is shown as it is and not kept",
    [res.status, (await store(w, "gw-pages-v1")).paths()],
    [500, []],
  );
}

{
  const w = world({ routes: { "/home": { body: "home v1" } } });
  const { gw } = load(w);
  await gw.page(nav("/home"), none);
  w.routes["/home"] = { body: "home v2" };
  w.slow = true;
  const waits: Promise<unknown>[] = [];
  eq(
    "a slow connection: the kept copy after 4 seconds",
    [await (await gw.page(nav("/home"), (p) => waits.push(p))).text(), w.timers],
    ["home v1", [4000]],
  );
  await Promise.all(waits);
  eq(
    "and the fresh page is kept for next time",
    await (await (await store(w, "gw-pages-v1")).match("/home"))!.text(),
    "home v2",
  );
  w.slow = false;
  eq(
    "a quick answer is the fresh page",
    await (await gw.page(nav("/home"), none)).text(),
    "home v2",
  );
}
{
  const w = world({ slow: true, routes: { "/inbox": { body: "inbox" } } });
  const { gw } = load(w);
  eq(
    "a page with no copy waits for the network, however slow",
    [await (await gw.page(nav("/inbox"), none)).text(), w.timers],
    ["inbox", []],
  );
}

// ---------------------------------------------------------------- app files

{
  const w = world({ routes: { "/assets/a.js": { body: "a" } } });
  const { gw } = load(w);
  eq("a missing file is fetched", await (await gw.file(req("/assets/a.js"))).text(), "a");
  w.online = false;
  eq(
    "then served from the phone with no signal",
    await (await gw.file(req("/assets/a.js"))).text(),
    "a",
  );
  eq("without fetching again", w.fetched, ["/assets/a.js"]);
  w.online = true;
  await gw.file(req("/assets/missing.js"));
  eq("a file the server lacks isn't kept", (await store(w, "gw-files-v1")).paths(), [
    "/assets/a.js",
  ]);
}
{
  const routes: World["routes"] = {};
  for (let n = 0; n < 302; n++) routes[`/assets/f${n}.js`] = { body: String(n) };
  const w = world({ routes });
  const { gw } = load(w);
  for (let n = 0; n < 302; n++) await gw.file(req(`/assets/f${n}.js`));
  const kept = (await store(w, "gw-files-v1")).paths();
  eq(
    "at most 300 files, the oldest dropped",
    [kept.length, kept[0], kept.at(-1)],
    [gw.MAX_FILES, "/assets/f2.js", "/assets/f301.js"],
  );
}

// ---------------------------------------------------------------- refreshed in the background

{
  const w = world({ routes: { "/geo/nairobi-wards.json": { body: "shapes v1" } } });
  const { gw } = load(w);
  const waits: Promise<Response>[] = [];
  eq(
    "not yet kept: fetched",
    await (await gw.refresh(req("/geo/nairobi-wards.json"), (p) => waits.push(p))).text(),
    "shapes v1",
  );
  w.routes["/geo/nairobi-wards.json"] = { body: "shapes v2" };
  eq(
    "kept: the copy at once",
    await (await gw.refresh(req("/geo/nairobi-wards.json"), (p) => waits.push(p))).text(),
    "shapes v1",
  );
  await Promise.all(waits);
  eq(
    "while a fresh copy is fetched behind it",
    await (await (await store(w, "gw-refresh-v1")).match("/geo/nairobi-wards.json"))!.text(),
    "shapes v2",
  );
  w.online = false;
  eq(
    "no signal: the copy",
    await (await gw.refresh(req("/geo/nairobi-wards.json"), (p) => waits.push(p))).text(),
    "shapes v2",
  );
  await Promise.all(waits);
  eq(
    "no signal and no copy: an error",
    (await gw.refresh(req("/brand/new.png"), () => {})).type,
    "error",
  );
}

// ---------------------------------------------------------------- activate and the fetch event

{
  const w = world();
  for (const name of ["gw-pages-v0", "gw-files-v0", "gw-pages-v1", "someone-else"])
    await w.caches.open(name);
  const { gw, listeners } = load(w);
  await gw.activate();
  eq(
    "older stores go; others' stay",
    [(await w.caches.keys()).sort(), w.claimed],
    [["gw-pages-v1", "someone-else"], true],
  );
  const answered: string[] = [];
  const event = (r: Req) => ({
    request: r,
    respondWith: () => answered.push(r.url),
    waitUntil: () => {},
  });
  listeners["fetch"]!(event(req("/_serverFn/abc")));
  listeners["fetch"]!(event(nav("/home")));
  eq("only what it keeps is answered by it", answered, [`${ORIGIN}/home`]);
}

eq("the offline pages", load(world()).gw.OFFLINE_PAGES, [
  "/home",
  "/field",
  "/diary",
  "/voters",
  "/elections",
  "/strategy",
]);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx tsx --tsconfig tsconfig.json tests/sw.test.ts`
Expected: FAIL: the run stops with `ENOENT: no such file or directory, open 'public/sw.js'`.

- [ ] **Step 3: Write the background file**

Create `public/sw.js`:

```js
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
```

- [ ] **Step 4: Run the test**

Run: `npx tsx --tsconfig tsconfig.json tests/sw.test.ts`
Expected: `31 passed, 0 failed`.

- [ ] **Step 5: Write the offline page**

Create `public/offline.html`. It is self-contained (inline style, the mark drawn inline), so it needs no other file with no signal:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#141C19" />
    <title>Offline · Groundwork</title>
    <style>
      :root {
        color-scheme: dark;
      }
      body {
        margin: 0;
        min-height: 100dvh;
        display: grid;
        place-items: center;
        padding: 24px 16px;
        box-sizing: border-box;
        background: #141c19;
        color: #f5f5f0;
        font:
          16px/1.5 system-ui,
          -apple-system,
          "Segoe UI",
          sans-serif;
      }
      main {
        width: min(420px, 100%);
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      svg {
        width: 40px;
        height: 40px;
      }
      h1 {
        margin: 0;
        font-size: 24px;
        line-height: 1.2;
      }
      p {
        margin: 0;
        color: #c9cbc4;
      }
      nav {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 6px;
      }
      a {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        padding: 0 18px;
        border-radius: 10px;
        font-weight: 600;
        text-decoration: none;
        color: #fff;
        background: #d9481c;
      }
      a + a {
        background: transparent;
        border: 1.5px solid #5b625e;
      }
    </style>
  </head>
  <body>
    <main>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path d="M86 28V14H14V86H86V52H62" fill="none" stroke="#F5F5F0" stroke-width="13" />
        <rect x="40" y="45.5" width="13" height="13" fill="#D9481C" />
      </svg>
      <h1>You're offline.</h1>
      <p>The field app and the pages you've opened before work without signal.</p>
      <nav>
        <a href="/field">Field app</a>
        <a href="/home">Home</a>
      </nav>
    </main>
  </body>
</html>
```

- [ ] **Step 6: Check the files**

Run: `node --check public/sw.js && npx prettier --check public/sw.js public/offline.html tests/sw.test.ts && npx eslint tests/sw.test.ts`
Expected: `All matched files use Prettier code style!` and no lint output. (ESLint covers ts and tsx only; `node --check` parses the background file.)

- [ ] **Step 7: Commit**

```bash
git add public/sw.js \
  public/offline.html \
  tests/sw.test.ts
git commit -m "$(cat <<'EOF'
Offline: the background file keeps the app's files and the offline pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 2: Two installs and the install button

**Files:**
- Create: `src/lib/offline/app.ts`
- Create: `public/field.webmanifest`
- Create: `src/components/gw/offline/InstallApp.tsx`
- Modify: `public/site.webmanifest`, `src/routes/__root.tsx`, `src/router.tsx`, `src/components/gw/ConsoleShell.tsx`, `src/routes/_authenticated/field.tsx`, `src/styles/gw-app.css`, `AGENTS.md`
- Test: `tests/offline-app.test.ts`

**Interfaces:**
- Consumes: `/sw.js` (Task 1), which `startInstallable` registers.
- Produces, from `@/lib/offline/app`:
  - `shouldRegister(hostname: string, search: string): boolean`
  - `manifestHref(pathname: string): string`, which is `/field.webmanifest?v=4` on `/field` and below, else `/site.webmanifest?v=4`
  - `type InstallKind = "prompt" | "ios" | null` and `installKind(o: { standalone: boolean; hasPrompt: boolean; userAgent: string; touchPoints: number }): InstallKind`
  - `type InstallPrompt = Event & { prompt: () => Promise<void> }`
  - `installOffer: { get(): InstallPrompt | null; subscribe(listener: () => void): () => void; use(): Promise<void> }`
  - `startInstallable(): void`, browser only and safe to call twice
- Produces `<InstallApp className?: string />` from `@/components/gw/offline/InstallApp`.

- [ ] **Step 1: Write the failing test**

Create `tests/offline-app.test.ts`:

```ts
// Checks for the installable app's rules: where the background file runs, the
// manifest each page names and the two manifests themselves, and the install
// offer. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/offline-app.test.ts

import { readFileSync } from "node:fs";

import { installKind, manifestHref, shouldRegister } from "@/lib/offline/app";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

// ---------------------------------------------------------------- where it runs

eq(
  "the live site and every campaign's address; localhost only when asked; never the preview",
  [
    shouldRegister("groundwork.ke", ""),
    shouldRegister("sakaja.groundwork.ke", ""),
    shouldRegister("localhost", "?sw=1"),
    shouldRegister("localhost", ""),
    shouldRegister("id-preview--abc.lovable.app", "?sw=1"),
    shouldRegister("notgroundwork.ke", ""),
  ],
  [true, true, true, false, false, false],
);

// ---------------------------------------------------------------- manifests

eq(
  "the field app's pages name the field manifest; every other page the main one",
  [
    manifestHref("/field"),
    manifestHref("/field/x"),
    manifestHref("/fieldwork"),
    manifestHref("/home"),
  ],
  [
    "/field.webmanifest?v=4",
    "/field.webmanifest?v=4",
    "/site.webmanifest?v=4",
    "/site.webmanifest?v=4",
  ],
);
{
  const site = JSON.parse(readFileSync("public/site.webmanifest", "utf8"));
  const field = JSON.parse(readFileSync("public/field.webmanifest", "utf8"));
  eq(
    "two installs: their own ids and start pages, the same scope and icons",
    [site.id, site.start_url, field.id, field.start_url, field.name, site.scope, field.scope],
    ["/", "/home", "/field", "/field", "Groundwork Field", "/", "/"],
  );
  eq("the same icons", field.icons, site.icons);
}

// ---------------------------------------------------------------- the install offer

const ua = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36",
};
eq(
  "the prompt where offered, the iPhone note, nothing installed or elsewhere",
  [
    installKind({ standalone: false, hasPrompt: true, userAgent: ua.android, touchPoints: 5 }),
    installKind({ standalone: false, hasPrompt: false, userAgent: ua.iphone, touchPoints: 5 }),
    installKind({ standalone: false, hasPrompt: false, userAgent: ua.ipad, touchPoints: 5 }),
    installKind({ standalone: false, hasPrompt: false, userAgent: ua.ipad, touchPoints: 0 }),
    installKind({ standalone: true, hasPrompt: true, userAgent: ua.android, touchPoints: 5 }),
    installKind({ standalone: false, hasPrompt: false, userAgent: ua.android, touchPoints: 5 }),
  ],
  ["prompt", "ios", "ios", null, null, null],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx tsx --tsconfig tsconfig.json tests/offline-app.test.ts`
Expected: FAIL: the run stops with `ERR_MODULE_NOT_FOUND` for `src/lib/offline/app`.

- [ ] **Step 3: Write the rules**

Create `src/lib/offline/app.ts`:

```ts
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
```

- [ ] **Step 4: Write the two manifests**

Replace the whole of `public/site.webmanifest` (it gains an `id`, opens at `/home`, and states its scope):

```json
{
  "id": "/",
  "name": "Groundwork · the campaign OS",
  "short_name": "Groundwork",
  "description": "Groundwork campaign workspace",
  "start_url": "/home",
  "scope": "/",
  "display": "standalone",
  "background_color": "#141C19",
  "theme_color": "#141C19",
  "icons": [
    { "src": "/brand/groundwork-app-icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/brand/groundwork-app-icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Create `public/field.webmanifest`:

```json
{
  "id": "/field",
  "name": "Groundwork Field",
  "short_name": "Field",
  "description": "Groundwork's field app: the doors, with or without signal",
  "start_url": "/field",
  "scope": "/",
  "display": "standalone",
  "background_color": "#141C19",
  "theme_color": "#141C19",
  "icons": [
    { "src": "/brand/groundwork-app-icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/brand/groundwork-app-icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 5: Run the test**

Run: `npx tsx --tsconfig tsconfig.json tests/offline-app.test.ts`
Expected: `5 passed, 0 failed`.

- [ ] **Step 6: Name each page's manifest, and start the installable app**

`startInstallable` keeps the browser's install offer from the moment the app starts (the offer can come before any button is on screen) and registers `/sw.js` on the live site.

In `src/routes/__root.tsx`, replace:

```tsx
import { reportLovableError } from "../lib/lovable-error-reporting";
```

with:

```tsx
import { reportLovableError } from "../lib/lovable-error-reporting";
import { manifestHref } from "@/lib/offline/app";
```

Then replace:

```tsx
  head: () => ({
```

with:

```tsx
  head: ({ matches }) => ({
```

And replace:

```tsx
      { rel: "manifest", href: "/site.webmanifest?v=3" },
```

with:

```tsx
      // The field app's pages name its own manifest, so installing from them installs it.
      { rel: "manifest", href: manifestHref(matches.at(-1)?.pathname ?? "/") },
```

In `src/router.tsx`, replace:

```tsx
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();
```

with:

```tsx
import { routeTree } from "./routeTree.gen";
import { startInstallable } from "@/lib/offline/app";

export const getRouter = () => {
  if (typeof window !== "undefined") {
    startInstallable();
  }
  const queryClient = new QueryClient();
```

- [ ] **Step 7: The install button**

Where the browser offers installs it is a button: "Install the app", or "Install Groundwork Field" on the field page, whose manifest is the field app's. On iPhone and iPad it is the Share note. Once the app runs installed, nothing.

Create `src/components/gw/offline/InstallApp.tsx`:

```tsx
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
```

In `src/components/gw/ConsoleShell.tsx`, replace:

```tsx
import { GwMark } from "./GwMark";
```

with:

```tsx
import { GwMark } from "./GwMark";
import { InstallApp } from "./offline/InstallApp";
```

In the sidebar's foot, under Sign out, replace:

```tsx
            <button className="sb-signout" type="button" onClick={signOut}>
              Sign out
            </button>
          </div>
```

with:

```tsx
            <button className="sb-signout" type="button" onClick={signOut}>
              Sign out
            </button>
          </div>
          <div className="sb-foot-line">
            <InstallApp className="sb-signout" />
          </div>
```

In the phone menu's footer, replace:

```tsx
                  Sign out
                </Button>
```

with:

```tsx
                  Sign out
                </Button>
                <InstallApp className="mobile-menu-install" />
```

In `src/routes/_authenticated/field.tsx`, replace:

```tsx
import { FieldApp } from "@/components/gw/FieldApp";
```

with:

```tsx
import { FieldApp } from "@/components/gw/FieldApp";
import { InstallApp } from "@/components/gw/offline/InstallApp";
```

Prettier's wrap of the line above the button (the file's one formatting fault), replace:

```tsx
            Pick a ward and your street, walk door by door, tap what happened. Visits save on the phone when there is no signal
            and sync when it comes back.
```

with:

```tsx
            Pick a ward and your street, walk door by door, tap what happened. Visits save on the
            phone when there is no signal and sync when it comes back.
```

And beside the week's doors, replace:

```tsx
            {nf.format(data?.totals.contactedWeek ?? 0)} doors logged this week
          </span>
```

with:

```tsx
            {nf.format(data?.totals.contactedWeek ?? 0)} doors logged this week
          </span>
          <InstallApp className="btn btn--ghost btn--sm" />
```

Append to the end of `src/styles/gw-app.css`, by hand (don't run Prettier on the whole file, which would reformat it):

```css
/* Installing: the iPhone's install note, and the phone menu's install button, under Sign
   out and in line with it. */
.install-note {
  font-size: 11.5px;
  opacity: 0.75;
}
.mobile-menu-install {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--gw-sidebar-fg);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.mobile-menu-install:hover {
  background: var(--gw-sidebar-accent);
}
```

- [ ] **Step 8: Update the project notes**

In `AGENTS.md`, replace:

```markdown
- Root head shares `/brand/` PNG/ICO favicons and manifest across all hosts for consistent browser and installed-app identity.
```

with:

```markdown
- Root head shares `/brand/` PNG/ICO favicons across all hosts; it links `field.webmanifest` on `/field` and `site.webmanifest` elsewhere, so the field app installs on its own. Why: consistent installed-app identity, with agents opening straight into the field app.
```

- [ ] **Step 9: Check**

Run: `npx tsc --noEmit && npx eslint src/lib/offline/app.ts src/components/gw/offline/InstallApp.tsx src/routes/__root.tsx src/router.tsx src/components/gw/ConsoleShell.tsx src/routes/_authenticated/field.tsx tests/offline-app.test.ts && npx prettier --check src/lib/offline/app.ts src/components/gw/offline/InstallApp.tsx src/routes/__root.tsx src/router.tsx src/components/gw/ConsoleShell.tsx src/routes/_authenticated/field.tsx tests/offline-app.test.ts public/site.webmanifest public/field.webmanifest`
Expected: no type errors, no lint output, `All matched files use Prettier code style!`.

- [ ] **Step 10: Commit**

```bash
git add src/lib/offline/app.ts \
  src/components/gw/offline/InstallApp.tsx \
  public/site.webmanifest \
  public/field.webmanifest \
  src/routes/__root.tsx \
  src/router.tsx \
  src/components/gw/ConsoleShell.tsx \
  src/routes/_authenticated/field.tsx \
  src/styles/gw-app.css \
  AGENTS.md \
  tests/offline-app.test.ts
git commit -m "$(cat <<'EOF'
Offline: two installs, Groundwork and Groundwork Field, and the install button

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 3: Saved page data, the phone's sign-in, and signing out

**Files:**
- Create: `src/lib/offline/saved.ts`, `src/lib/offline/persist.ts`, `src/lib/offline/store.ts`, `src/lib/offline/session.ts`
- Create: `src/hooks/useOfflineData.ts`, `src/hooks/useSignOut.ts`, `src/components/gw/offline/OfflineData.tsx`
- Modify: `src/routes/__root.tsx`, `src/components/gw/ConsoleShell.tsx`, `src/routes/_authenticated/route.tsx` (its waiting screen's sign-out), `AGENTS.md`
- Test: `tests/offline-saved.test.ts`, `tests/offline-session.test.ts`

**Interfaces:**
- Consumes:
  - `shouldRegister` (Task 2)
  - the types `CanvassData` and `VotersData` from `@/lib/console.functions`
  - `isNetworkError(e: unknown): boolean` from `@/lib/field`
- Produces, from `@/lib/offline/saved`:
  - `SAVED_VERSION = 1` and `MAX_AGE_MS`
  - `type SavedEntry = { id; key; data; updatedAt }` and `type Who = { userId; campaignId; version }`
  - `isSaved(key)`, `idOf(key)`, `keptForm(key, data)`, `restorable(entries, now): { keep; drop }` and `campaignOf(access)`
- Produces, from `@/lib/offline/persist`:
  - `type OfflineStore = { readWho; writeWho; all; put; remove; clear }`
  - `startSaving(queryClient, store, userId, { now?, wait? }): Promise<() => Promise<void>>`
  - `lastLoaded(queryClient): number`
- Produces `idbStore(): OfflineStore | null` from `@/lib/offline/store`.
- Produces, from `@/lib/offline/session`:
  - `CHECK_WAIT_MS` (5000)
  - `sessionKey(supabaseUrl)`, `userIn(raw): User | null` and `unreachable(error, online): boolean`
  - `within(promise, ms)`
  - `entryUser(check, kept, online, ms?): Promise<User | null>`
  - `signOutHere(signOut: () => Promise<{ error: unknown }>, forget: () => void): Promise<void>`
  - `phoneUser(): User | null` and `forgetPhoneSession(): void`
- Produces, from `@/hooks/useOfflineData`: `type OfflineData = { ready: boolean; forget(): Promise<void> }`, `OfflineDataContext` and `useOfflineData()`.
- Produces `OfflineDataProvider` (`@/components/gw/offline/OfflineData`) and `useSignOut(): () => Promise<void>` (`@/hooks/useSignOut`).

- [ ] **Step 1: Write the failing test for the saved data**

Create `tests/offline-saved.test.ts`:

```ts
// Checks for the page data kept for no signal: what each saved query keeps
// (never the voter file, the contacts feed, walk lists or recent visits), the
// 14-day limit, putting data back as old, saving as queries load, and clearing
// for another person, campaign or format. Runs against a real query cache and a
// stand-in for the phone's storage. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/offline-saved.test.ts

import { QueryClient } from "@tanstack/react-query";

import { lastLoaded, startSaving, type OfflineStore } from "@/lib/offline/persist";
import {
  idOf,
  isSaved,
  keptForm,
  MAX_AGE_MS,
  restorable,
  SAVED_VERSION,
  type SavedEntry,
  type Who,
} from "@/lib/offline/saved";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

/** The phone's storage, in memory. */
function memory(who: Who | null = null, entries: SavedEntry[] = []) {
  const m = { who, saved: new Map(entries.map((e) => [e.id, e])), cleared: 0, slow: false };
  const store: OfflineStore = {
    readWho: async () => m.who,
    writeWho: async (w) => void (m.who = w),
    all: async () => [...m.saved.values()],
    put: async (e) => {
      if (m.slow) await new Promise((r) => setTimeout(r, 20));
      m.saved.set(e.id, e);
    },
    remove: async (ids) => ids.forEach((id) => m.saved.delete(id)),
    clear: async () => {
      m.saved.clear();
      m.who = null;
      m.cleared++;
    },
  };
  return { m, store };
}
const settle = () => new Promise((r) => setTimeout(r, 10));
const NOW = Date.parse("2026-10-14T09:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const entry = (key: unknown[], data: unknown, age = DAY): SavedEntry => ({
  id: idOf(key),
  key,
  data,
  updatedAt: NOW - age,
});
const ME = { userId: "u1", campaignId: "c1", version: SAVED_VERSION };

// ---------------------------------------------------------------- what is kept

eq(
  "the saved queries; others aren't",
  [
    ["my-access"],
    ["home", "c1"],
    ["diary", "c1", null],
    ["voters"],
    ["canvassing"],
    ["area-doors"],
    ["atlas"],
    ["findings", "c1"],
    ["map-config"],
    ["people"],
    ["walk-list", "w1", null],
    ["house", "6GCR+22"],
    ["inbox"],
  ].map(isSaved),
  [true, true, true, true, true, true, true, true, true, false, false, false, false],
);
eq(
  "Voters keeps its wards and totals; never the people or the feed",
  keptForm(["voters"], {
    wards: [{ id: "w1", name: "Kangemi", people: 4 }],
    totals: { people: 4 },
    feed: [{ name: "Wanjiru", phone: "+254700000000" }],
    people: [{ name: "Wanjiru", phone: "+254700000000" }],
    extra: "a field added later",
  }),
  {
    wards: [{ id: "w1", name: "Kangemi", people: 4 }],
    totals: { people: 4 },
    feed: [],
    people: [],
  },
);
eq(
  "the doors keep their counts and issues; never the walk list or recent visits",
  keptForm(["canvassing"], {
    totals: { people: 9 },
    wards: [{ id: "w1", knocked: 3 }],
    issues: [{ name: "Water", count: 2 }],
    unplaced: { people: 1, knocked: 0, doors30: 0 },
    walkList: [{ name: "Wanjiru", phone: "+254700000000" }],
    recent: [{ person: "Wanjiru" }],
  }),
  {
    totals: { people: 9 },
    wards: [{ id: "w1", knocked: 3 }],
    issues: [{ name: "Water", count: 2 }],
    unplaced: { people: 1, knocked: 0, doors30: 0 },
    walkList: [],
    recent: [],
  },
);
eq(
  "other saved queries as loaded; unsaved ones not at all",
  [keptForm(["atlas"], { a: 1 }), keptForm(["people"], [1])],
  [{ a: 1 }, undefined],
);
{
  const young = entry(["home", "c1"], 1, MAX_AGE_MS - 1);
  const old = entry(["atlas"], 2, MAX_AGE_MS + 1);
  const stray = entry(["people"], 3);
  const { keep, drop } = restorable([young, old, stray], NOW);
  eq(
    "14 days at most; anything not on the list goes",
    [keep.map((e) => e.id), drop],
    [[young.id], [old.id, stray.id]],
  );
}

// ---------------------------------------------------------------- putting back

{
  const qc = new QueryClient();
  const { m, store } = memory(ME, [
    entry(["home", "c1"], { story: "saved" }, DAY),
    entry(["atlas"], { areas: [] }, 20 * DAY),
  ]);
  const stop = await startSaving(qc, store, "u1", { now: () => NOW, wait: 0 });
  const state = qc.getQueryState(["home", "c1"]);
  eq(
    "saved data comes back with its load time",
    [qc.getQueryData(["home", "c1"]), state?.dataUpdatedAt],
    [{ story: "saved" }, NOW - DAY],
  );
  const kept = qc.getQueryCache().find({ queryKey: ["home", "c1"] })!;
  eq(
    "so every page refreshes it with signal, even one that otherwise keeps its data for good",
    [kept.isStaleByTime(5 * 60_000), kept.isStaleByTime(Infinity)],
    [true, true],
  );
  eq(
    "data past 14 days isn't put back, and is deleted",
    [qc.getQueryData(["atlas"]), [...m.saved.keys()]],
    [undefined, [idOf(["home", "c1"])]],
  );
  eq("the last load is the newest saved", lastLoaded(qc), NOW - DAY);
  stop();
}
{
  const qc = new QueryClient();
  qc.setQueryData(["home", "c1"], { story: "fresh" }, { updatedAt: NOW });
  const { store } = memory(ME, [entry(["home", "c1"], { story: "saved" }, DAY)]);
  const stop = await startSaving(qc, store, "u1", { now: () => NOW, wait: 0 });
  eq("fresher data already loaded isn't replaced", qc.getQueryData(["home", "c1"]), {
    story: "fresh",
  });
  stop();
}

// ---------------------------------------------------------------- saving as queries load

{
  const qc = new QueryClient();
  const { m, store } = memory(ME);
  const stop = await startSaving(qc, store, "u1", { now: () => NOW, wait: 0 });
  await qc.fetchQuery({
    queryKey: ["voters"],
    queryFn: async () => ({
      wards: [],
      totals: {},
      feed: [{ name: "x" }],
      people: [{ name: "y" }],
    }),
  });
  await qc.fetchQuery({
    queryKey: ["people"],
    queryFn: async () => [{ name: "y", phone: "+254700000000" }],
  });
  await settle();
  eq(
    "a saved query is stored as it's kept; others aren't stored",
    [...m.saved.values()].map((e) => [e.id, e.data]),
    [['["voters"]', { wards: [], totals: {}, feed: [], people: [] }]],
  );
  stop();
  await qc.fetchQuery({ queryKey: ["atlas"], queryFn: async () => ({ a: 1 }) });
  await settle();
  eq("after stopping, nothing more is saved", m.saved.size, 1);
}

{
  const qc = new QueryClient();
  const { m, store } = memory(ME);
  m.slow = true;
  const stop = await startSaving(qc, store, "u1", { now: () => NOW, wait: 0 });
  await qc.fetchQuery({ queryKey: ["atlas"], queryFn: async () => ({ a: 1 }) });
  await new Promise((r) => setTimeout(r, 5)); // the save is under way
  await stop();
  eq("stopping waits for a save under way, so a clear after it is final", m.saved.size, 1);
}

// ---------------------------------------------------------------- whose data

{
  const { m, store } = memory(
    { userId: "someone-else", campaignId: "c1", version: SAVED_VERSION },
    [entry(["home", "c1"], { story: "theirs" })],
  );
  const qc = new QueryClient();
  const stop = await startSaving(qc, store, "u1", { now: () => NOW, wait: 0 });
  eq(
    "another person's data is deleted, not shown",
    [qc.getQueryData(["home", "c1"]), m.saved.size, m.who],
    [undefined, 0, { userId: "u1", campaignId: null, version: SAVED_VERSION }],
  );
  stop();
}
{
  const { m, store } = memory({ ...ME, version: SAVED_VERSION - 1 }, [
    entry(["home", "c1"], { story: "old format" }),
  ]);
  const stop = await startSaving(new QueryClient(), store, "u1", { now: () => NOW, wait: 0 });
  eq("another format is deleted", m.saved.size, 0);
  stop();
}
{
  const qc = new QueryClient();
  const { m, store } = memory(ME, [entry(["home", "c1"], { story: "c1's" })]);
  const stop = await startSaving(qc, store, "u1", { now: () => NOW, wait: 0 });
  await qc.fetchQuery({
    queryKey: ["my-access"],
    queryFn: async () => ({ role: "manager", campaign: { id: "c2" } }),
  });
  await settle();
  eq(
    "another campaign clears what was saved for the last one",
    [[...m.saved.keys()], m.who?.campaignId],
    [['["my-access"]'], "c2"],
  );
  stop();
}
{
  const qc = new QueryClient();
  const { m, store } = memory(null);
  const stop = await startSaving(qc, store, "u1", { now: () => NOW, wait: 0 });
  await qc.fetchQuery({
    queryKey: ["my-access"],
    queryFn: async () => ({ role: "agent", campaign: { id: "c1" } }),
  });
  await settle();
  eq(
    "the first access names the campaign",
    [m.cleared, m.who],
    [1, { userId: "u1", campaignId: "c1", version: SAVED_VERSION }],
  );
  stop();
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx tsx --tsconfig tsconfig.json tests/offline-saved.test.ts`
Expected: FAIL: the run stops with `ERR_MODULE_NOT_FOUND` for `src/lib/offline/persist`.

- [ ] **Step 3: Write what is saved**

Create `src/lib/offline/saved.ts`:

```ts
// The page data kept on the phone for no signal: which queries, what of each
// is kept (never the voter file, the contacts feed, walk lists or recent
// visits), how long, and for whom. Pure.

import type { CanvassData, VotersData } from "@/lib/console.functions";

/** Saved data in another format is deleted rather than read. */
export const SAVED_VERSION = 1;
/** Nothing older than this is kept. */
export const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export type SavedEntry = { id: string; key: readonly unknown[]; data: unknown; updatedAt: number };
/** Whose saved data it is. */
export type Who = { userId: string; campaignId: string | null; version: number };

const same = (data: unknown) => data;

/** Each saved query, by the first part of its key, and what of it is kept. */
const KEEP: Record<string, (data: unknown) => unknown> = {
  "my-access": same,
  home: same,
  diary: same,
  atlas: same,
  findings: same,
  "area-doors": same,
  "map-config": same,
  voters: (data) => {
    const v = data as Partial<VotersData>;
    return { wards: v.wards ?? [], totals: v.totals, feed: [], people: [] };
  },
  canvassing: (data) => {
    const c = data as Partial<CanvassData>;
    return {
      totals: c.totals,
      wards: c.wards ?? [],
      issues: c.issues ?? [],
      unplaced: c.unplaced,
      walkList: [],
      recent: [],
    };
  },
};

export const isSaved = (key: readonly unknown[]): boolean =>
  typeof key[0] === "string" && Object.hasOwn(KEEP, key[0]);

export const idOf = (key: readonly unknown[]): string => JSON.stringify(key);

/** What of a query's data is kept; undefined for a query that isn't saved. */
export function keptForm(key: readonly unknown[], data: unknown): unknown {
  const keep = typeof key[0] === "string" && Object.hasOwn(KEEP, key[0]) ? KEEP[key[0]] : undefined;
  return keep && data !== undefined ? keep(data) : undefined;
}

/** The saved entries still young enough, and the ids of the rest. */
export function restorable(
  entries: SavedEntry[],
  now: number,
): { keep: SavedEntry[]; drop: string[] } {
  const keep: SavedEntry[] = [];
  const drop: string[] = [];
  for (const e of entries) {
    if (isSaved(e.key) && now - e.updatedAt <= MAX_AGE_MS) keep.push(e);
    else drop.push(e.id);
  }
  return { keep, drop };
}

/** The campaign a saved access record belongs to. */
export const campaignOf = (access: unknown): string | null =>
  (access as { campaign?: { id?: unknown } | null } | null)?.campaign?.id?.toString() ?? null;
```

- [ ] **Step 4: Write the saving**

Restored entries are marked old with `invalidateQueries({ refetchType: "none" })`: React Query then refetches them on the first use with signal even where a page's `staleTime` is `Infinity` (the map settings), and nothing fetches at start. Writes run one at a time, and `stop()` resolves once a save under way has finished, so a delete after it is final.

Create `src/lib/offline/persist.ts`:

```ts
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

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    const { queryKey, state } = event.query;
    if (!isSaved(queryKey)) return;
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
```

- [ ] **Step 5: Run the test**

Run: `npx tsx --tsconfig tsconfig.json tests/offline-saved.test.ts`
Expected: `17 passed, 0 failed`.

- [ ] **Step 6: Write the phone's storage**

IndexedDB has no stand-in in Node, so this small wrapper is checked by the type check here and by the phone after release.

Create `src/lib/offline/store.ts`:

```ts
// The phone's storage for saved page data: the browser's IndexedDB, database
// "groundwork-offline". Null when the browser has none or refuses it (private
// browsing, blocked site data): then nothing is saved and the app works online
// as before. Browser only.

import type { OfflineStore } from "@/lib/offline/persist";
import type { SavedEntry, Who } from "@/lib/offline/saved";

const DB = "groundwork-offline";
const SAVED = "saved";
const META = "meta";

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

function open(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(SAVED, { keyPath: "id" });
    request.result.createObjectStore(META);
  };
  return done(request);
}

export function idbStore(): OfflineStore | null {
  if (typeof indexedDB === "undefined") return null;
  let opened: Promise<IDBDatabase> | null = null;
  const db = () => (opened ??= open());
  const write = async (names: string[], job: (tx: IDBTransaction) => void) => {
    const tx = (await db()).transaction(names, "readwrite");
    job(tx);
    await finished(tx);
  };
  return {
    async readWho() {
      const tx = (await db()).transaction(META, "readonly");
      return ((await done(tx.objectStore(META).get("who"))) as Who | undefined) ?? null;
    },
    writeWho: (who) => write([META], (tx) => void tx.objectStore(META).put(who, "who")),
    async all() {
      const tx = (await db()).transaction(SAVED, "readonly");
      return (await done(tx.objectStore(SAVED).getAll())) as SavedEntry[];
    },
    put: (entry) => write([SAVED], (tx) => void tx.objectStore(SAVED).put(entry)),
    remove: (ids) =>
      write([SAVED], (tx) => {
        for (const id of ids) tx.objectStore(SAVED).delete(id);
      }),
    clear: () =>
      write([SAVED, META], (tx) => {
        tx.objectStore(SAVED).clear();
        tx.objectStore(META).clear();
      }),
  };
}
```

- [ ] **Step 7: Write the failing test for the phone's sign-in**

Create `tests/offline-session.test.ts`:

```ts
// Checks for the sign-in kept on the phone: Supabase's storage key, reading a
// stored session (even one whose hour-long access has run out), telling no
// signal from a refusal, who enters the signed-in area when Supabase answers,
// refuses, fails or doesn't answer in time, and signing out with no signal.
// Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/offline-session.test.ts

import type { User } from "@supabase/supabase-js";

import {
  entryUser,
  sessionKey,
  signOutHere,
  unreachable,
  userIn,
  within,
} from "@/lib/offline/session";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

const me = { id: "u1", email: "agent@example.test" } as User;
const stored = (o: Record<string, unknown>) => JSON.stringify(o);
const HOUR_AGO = Math.floor(Date.parse("2026-10-14T08:00:00Z") / 1000);

// ---------------------------------------------------------------- the stored session

eq(
  "Supabase's key for the project",
  sessionKey("https://abcdefghijklmnop.supabase.co"),
  "sb-abcdefghijklmnop-auth-token",
);
eq(
  "a stored session's user, even when its access has run out",
  userIn(stored({ access_token: "a", refresh_token: "r", expires_at: HOUR_AGO, user: me })),
  me,
);
eq(
  "nothing stored, unreadable, no refresh token, or no user: nobody",
  [
    userIn(null),
    userIn("{not json"),
    userIn(stored({ access_token: "a", user: me })),
    userIn(stored({ access_token: "a", refresh_token: "r", user: {} })),
    userIn("null"),
  ],
  [null, null, null, null, null],
);

// ---------------------------------------------------------------- no signal or a refusal

eq(
  "no signal, a fetch that failed in any browser, or Supabase's retryable error; not a refusal",
  [
    unreachable(null, false),
    unreachable({ name: "AuthRetryableFetchError", message: "Gateway timeout" }, true),
    unreachable(new TypeError("Failed to fetch"), true),
    unreachable(new Error("Load failed"), true),
    unreachable(new Error("NetworkError when attempting to fetch resource."), true),
    unreachable({ name: "AuthApiError", message: "Invalid JWT" }, true),
    unreachable({ name: "AuthSessionMissingError", message: "Auth session missing!" }, true),
    unreachable(null, true),
  ],
  [true, true, true, true, true, false, false, false],
);

// ---------------------------------------------------------------- in time or not

{
  const later = <T>(value: T, ms: number) => new Promise<T>((r) => setTimeout(() => r(value), ms));
  eq("an answer in time", await within(later("yes", 1), 50), "yes");
  eq("no answer in time", await within(later("yes", 50), 1), undefined);
  let refused: unknown;
  await within(Promise.reject(new Error("no")), 50).catch((e: Error) => (refused = e.message));
  eq("a failure in time is the failure", refused, "no");
}

// ---------------------------------------------------------------- who enters

{
  const answers =
    (data: { user: User | null }, error: unknown = null) =>
    async () => ({ data, error });
  const kept = () => me;
  const nobody = () => null;
  const never = () => new Promise<never>(() => {});
  const other = { id: "u2" } as User;
  eq(
    "Supabase's answer when it gives one",
    await entryUser(answers({ user: other }), kept, true),
    other,
  );
  eq(
    "a refusal or no session: sign in, whatever is kept",
    [
      await entryUser(
        answers({ user: null }, { name: "AuthApiError", message: "Invalid JWT" }),
        kept,
        true,
      ),
      await entryUser(answers({ user: null }, { name: "AuthSessionMissingError" }), kept, true),
    ],
    [null, null],
  );
  eq(
    "no signal, a failed fetch or a retryable error: the phone's sign-in",
    [
      await entryUser(answers({ user: null }, { name: "AuthRetryableFetchError" }), kept, true),
      await entryUser(async () => Promise.reject(new TypeError("Failed to fetch")), kept, true),
      await entryUser(answers({ user: null }, { name: "AuthApiError" }), kept, false),
    ],
    [me, me, me],
  );
  eq("no answer in time: the phone's sign-in", await entryUser(never, kept, true, 5), me);
  eq(
    "unreachable with no sign-in kept: sign in",
    await entryUser(answers({ user: null }, { name: "AuthRetryableFetchError" }), nobody, true),
    null,
  );
}

// ---------------------------------------------------------------- signing out

{
  const deleted: string[] = [];
  const forget = (why: string) => () => void deleted.push(why);
  await signOutHere(async () => ({ error: null }), forget("signed out"));
  await signOutHere(
    async () => ({ error: { name: "AuthRetryableFetchError" } }),
    forget("no signal"),
  );
  await signOutHere(() => Promise.reject(new TypeError("Failed to fetch")), forget("failed"));
  eq(
    "Supabase's sign-out deletes the session itself; when it can't, the phone's copy is deleted here",
    deleted,
    ["no signal", "failed"],
  );
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 8: Run it to see it fail**

Run: `npx tsx --tsconfig tsconfig.json tests/offline-session.test.ts`
Expected: FAIL: the run stops with `ERR_MODULE_NOT_FOUND` for `src/lib/offline/session`.

- [ ] **Step 9: Write the phone's sign-in**

Supabase keeps its session in the browser's storage under `sb-<project ref>-auth-token` (supabase-js's default key; on the live site the storage is `localStorage`). With no signal, `getSession()` returns no session once the hour-long access token has expired (its refresh fails), though the session stays stored. `phoneUser()` reads it directly. Supabase's sign-out deletes it only when it reaches the server, so `signOutHere` has `forgetPhoneSession()` delete it when the sign-out fails.

Create `src/lib/offline/session.ts`:

```ts
// The sign-in kept on the phone. Supabase keeps its session in the browser's
// storage; with no signal, its own calls report no session once the hour-long
// access token has run out, though the session is still there and refreshes
// when signal returns. So with no signal (or a connection too weak to answer in
// time) the signed-in area reads the stored session itself, and a sign-out
// deletes it. Pure apart from phoneUser and forgetPhoneSession, which read and
// clear the browser's storage.

import type { User } from "@supabase/supabase-js";

import { isNetworkError } from "@/lib/field";

/** How long the signed-in area's check waits for Supabase before using the phone's sign-in. */
export const CHECK_WAIT_MS = 5000;

/** Supabase's storage key for a project (supabase-js's default). */
export const sessionKey = (supabaseUrl: string): string =>
  `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;

/** The user of a stored session that can still be refreshed; null otherwise. */
export function userIn(raw: string | null): User | null {
  try {
    const s = JSON.parse(raw ?? "null") as {
      refresh_token?: unknown;
      user?: { id?: unknown };
    } | null;
    return typeof s?.refresh_token === "string" && typeof s.user?.id === "string"
      ? (s.user as User)
      : null;
  } catch {
    return null;
  }
}

/** No signal, or a request that never reached the server, as opposed to a refusal. */
export function unreachable(error: unknown, online: boolean): boolean {
  if (!online) return true;
  if ((error as { name?: unknown } | null)?.name === "AuthRetryableFetchError") return true;
  return error != null && isNetworkError(error);
}

/** The promise's result, or undefined if it takes longer than `ms`. */
export function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type Checked = { data: { user: User | null }; error: unknown };

/**
 * Who enters the signed-in area: the user Supabase confirms; when it can't be
 * reached or doesn't answer within `ms`, the sign-in kept on this phone, which
 * Supabase checks again once there's signal. Null (a refusal, or no sign-in
 * anywhere) means sign in.
 */
export async function entryUser(
  check: () => Promise<Checked>,
  kept: () => User | null,
  online: boolean,
  ms = CHECK_WAIT_MS,
): Promise<User | null> {
  let checked: Checked | undefined;
  try {
    checked = await within(check(), ms);
  } catch (error) {
    checked = { data: { user: null }, error };
  }
  if (checked?.data.user) return checked.data.user;
  return !checked || unreachable(checked.error, online) ? kept() : null;
}

/**
 * Signs out: Supabase's sign-out deletes the stored session, but only when it
 * reaches the server; when it fails (no signal), `forget` deletes the phone's
 * copy, so the phone is signed out either way.
 */
export async function signOutHere(
  signOut: () => Promise<{ error: unknown }>,
  forget: () => void,
): Promise<void> {
  const { error } = await signOut().catch((e: unknown) => ({ error: e }));
  if (error) forget();
}

const key = () => sessionKey(String(import.meta.env["VITE_SUPABASE_URL"]));

/** The user of the sign-in kept on this phone, read without the network. Browser only. */
export function phoneUser(): User | null {
  try {
    return userIn(localStorage.getItem(key()));
  } catch {
    return null;
  }
}

/** Deletes the sign-in kept on this phone, for a sign-out Supabase couldn't be reached for. Browser only. */
export function forgetPhoneSession(): void {
  try {
    localStorage.removeItem(key());
  } catch {
    // Storage refused: there's no kept sign-in to delete.
  }
}
```

- [ ] **Step 10: Run the test**

Run: `npx tsx --tsconfig tsconfig.json tests/offline-session.test.ts`
Expected: `13 passed, 0 failed`.

- [ ] **Step 11: Save with the app**

The provider starts saving for the person whose sign-in is on the phone (read without the network), starts again for someone else's sign-in, and deletes everything at sign-out. It runs only where the background file runs. The gate (Task 4) waits for `ready`, at most 3 seconds, so it doesn't ask for signal before saved access is back.

Create `src/hooks/useOfflineData.ts`:

```ts
import { createContext, useContext } from "react";

export type OfflineData = {
  /** Saved data is back in the query cache, or there was none to put back. */
  ready: boolean;
  /** Stops saving and deletes everything saved on this phone, for a sign-out. */
  forget: () => Promise<void>;
};

/** Provided by OfflineDataProvider (src/components/gw/offline/OfflineData.tsx). */
export const OfflineDataContext = createContext<OfflineData>({
  ready: true,
  forget: async () => undefined,
});

export const useOfflineData = (): OfflineData => useContext(OfflineDataContext);
```

Create `src/components/gw/offline/OfflineData.tsx`:

```tsx
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
```

In `src/routes/__root.tsx`, replace:

```tsx
import { manifestHref } from "@/lib/offline/app";
```

with:

```tsx
import { OfflineDataProvider } from "@/components/gw/offline/OfflineData";
import { manifestHref } from "@/lib/offline/app";
```

Then replace:

```tsx
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
```

with:

```tsx
      <OfflineDataProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </OfflineDataProvider>
```

- [ ] **Step 12: Sign out on the phone, signal or not**

Both sign-out buttons (the console's, and the waiting screen's in the signed-in gate) share one hook. It stops saving and deletes the saved data before Supabase's sign-out, and deletes the stored session when that sign-out fails.

Create `src/hooks/useSignOut.ts`:

```ts
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useOfflineData } from "@/hooks/useOfflineData";
import { supabase } from "@/integrations/supabase/client";
import { forgetPhoneSession, signOutHere } from "@/lib/offline/session";

/**
 * Signs out on this phone, signal or not, deleting the page data saved on it.
 * Supabase's sign-out needs signal; when it fails, the sign-in kept on the
 * phone is deleted here instead, so the phone is signed out either way.
 */
export function useSignOut(): () => Promise<void> {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { forget } = useOfflineData();
  return async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await forget();
    await signOutHere(() => supabase.auth.signOut(), forgetPhoneSession);
    navigate({ to: "/auth", replace: true });
  };
}
```

In `src/components/gw/ConsoleShell.tsx`, replace:

```tsx
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
```

with:

```tsx
import { Link, useRouterState } from "@tanstack/react-router";
```

Then replace:

```tsx
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useAccess";
```

with:

```tsx
import { useAccess } from "@/hooks/useAccess";
import { useSignOut } from "@/hooks/useSignOut";
```

Delete:

```tsx
  const navigate = useNavigate();
```

Replace:

```tsx
  const queryClient = useQueryClient();
```

with:

```tsx
  const signOut = useSignOut();
```

And delete:

```tsx
  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

```

In `src/routes/_authenticated/route.tsx`, replace:

```tsx
import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
```

with:

```tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
```

Then replace:

```tsx
import { useAccess } from "@/hooks/useAccess";
```

with:

```tsx
import { useAccess } from "@/hooks/useAccess";
import { useSignOut } from "@/hooks/useSignOut";
```

And in `Waiting`, replace:

```tsx
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { recheck, checking, campaign, wrongCampaign } = useAccess();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
```

with:

```tsx
  const { recheck, checking, campaign, wrongCampaign } = useAccess();
  const signOut = useSignOut();
```

- [ ] **Step 13: Update the project notes**

In `AGENTS.md`, after the manifest line Task 2 wrote, add the second line here. Replace:

```markdown
so the field app installs on its own. Why: consistent installed-app identity, with agents opening straight into the field app.
```

with:

```markdown
so the field app installs on its own. Why: consistent installed-app identity, with agents opening straight into the field app.
- `public/sw.js` keeps the app's files and the offline pages for no signal; the app saves the listed queries' data (src/lib/offline/saved.ts) in IndexedDB, never the voter file, walk lists or the feed. Why: field teams open the app where the signal drops, without carrying voter data.
```

- [ ] **Step 14: Check**

Run: `npx tsc --noEmit && npx eslint src/lib/offline/saved.ts src/lib/offline/persist.ts src/lib/offline/store.ts src/lib/offline/session.ts src/hooks/useOfflineData.ts src/hooks/useSignOut.ts src/components/gw/offline/OfflineData.tsx src/routes/__root.tsx src/components/gw/ConsoleShell.tsx src/routes/_authenticated/route.tsx tests/offline-saved.test.ts tests/offline-session.test.ts && npx prettier --check src/lib/offline/saved.ts src/lib/offline/persist.ts src/lib/offline/store.ts src/lib/offline/session.ts src/hooks/useOfflineData.ts src/hooks/useSignOut.ts src/components/gw/offline/OfflineData.tsx src/routes/__root.tsx src/components/gw/ConsoleShell.tsx src/routes/_authenticated/route.tsx tests/offline-saved.test.ts tests/offline-session.test.ts`
Expected: no type errors, no lint output, `All matched files use Prettier code style!`.

- [ ] **Step 15: Commit**

```bash
git add src/lib/offline/saved.ts \
  src/lib/offline/persist.ts \
  src/lib/offline/store.ts \
  src/lib/offline/session.ts \
  src/hooks/useOfflineData.ts \
  src/hooks/useSignOut.ts \
  src/components/gw/offline/OfflineData.tsx \
  src/routes/__root.tsx \
  src/components/gw/ConsoleShell.tsx \
  src/routes/_authenticated/route.tsx \
  tests/offline-saved.test.ts \
  tests/offline-session.test.ts \
  AGENTS.md
git commit -m "$(cat <<'EOF'
Offline: page data kept on the phone, the phone's sign-in, signing out without signal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 4: The offline screens

**Files:**
- Create: `src/lib/offline/screens.ts`, `src/hooks/useOnline.ts`, `src/components/gw/offline/OfflineBar.tsx`, `src/components/gw/offline/NeedsSignal.tsx`
- Modify: `src/router.tsx`, `src/routes/_authenticated/route.tsx`, `src/components/gw/ConsoleShell.tsx`, `src/routes/_authenticated/voters.tsx`, `src/components/gw/FieldApp.tsx`, `src/styles/gw-app.css`
- Test: `tests/offline-screens.test.ts`

**Interfaces:**
- Consumes:
  - the `OFFLINE_PAGES` line in `public/sw.js` (Task 1)
  - `lastLoaded` and `useOfflineData` (Task 3)
  - `entryUser` and `phoneUser` (Task 3)
- Produces, from `@/lib/offline/screens`:
  - `OFFLINE_PAGES`
  - `needsSignal(pathname: string, hasData: (key: string) => boolean): boolean`
  - `type GateState = "checking" | "in" | "failed" | "first-visit"` and `gateState({ ready, loading, failed, hasAccess, online }): GateState`
  - `lastLoadedText(ms: number, now: number): string | null`
- Produces `useOnline(): boolean`, `<OfflineBar />` and `<NeedsSignal />`.

- [ ] **Step 1: Write the failing test**

Create `tests/offline-screens.test.ts`:

```ts
// Checks for the screens with no signal: the pages that open (the same list as
// public/sw.js keeps), the sign-in gate, and the offline bar's time. Pure. Run
// from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/offline-screens.test.ts

import { readFileSync } from "node:fs";

import { gateState, lastLoadedText, needsSignal, OFFLINE_PAGES } from "@/lib/offline/screens";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

// ---------------------------------------------------------------- pages

eq(
  "the same offline pages as the background file",
  OFFLINE_PAGES,
  JSON.parse(
    /const OFFLINE_PAGES = (\[[^\]]*\])/
      .exec(readFileSync("public/sw.js", "utf8"))![1]!
      .replace(/'/g, '"'),
  ),
);
eq(
  "with no signal, pages off the list need signal, saved data or not",
  ["/inbox", "/finance", "/homework", "/fieldwork", "/home/x"].map((p) =>
    needsSignal(p, () => true),
  ),
  [true, true, true, true, false],
);
eq(
  "pages on the list open when what they show was saved",
  [
    needsSignal("/home", (key) => key === "home"),
    needsSignal("/diary", (key) => key === "diary"),
    needsSignal("/voters", (key) => key === "voters"),
    needsSignal("/field", (key) => key === "voters"),
    needsSignal("/elections", (key) => key === "atlas"),
    needsSignal("/strategy", (key) => key === "atlas"),
  ],
  [false, false, false, false, false, false],
);
eq(
  "and need signal when nothing was saved for them",
  OFFLINE_PAGES.map((p) => needsSignal(p, () => false)),
  OFFLINE_PAGES.map(() => true),
);

// ---------------------------------------------------------------- the gate

const gate = (o: Partial<Parameters<typeof gateState>[0]>) =>
  gateState({ ready: true, loading: false, failed: false, hasAccess: false, online: true, ...o });
eq(
  "saved access lets the person in, signal or not, even when the check fails",
  [gate({ hasAccess: true, online: false }), gate({ hasAccess: true, failed: true })],
  ["in", "in"],
);
eq(
  "no saved access and no signal: open it once with signal",
  [gate({ online: false, loading: true }), gate({ online: false, failed: true })],
  ["first-visit", "first-visit"],
);
eq(
  "until saved data is back, checking",
  gate({ ready: false, online: false, loading: true }),
  "checking",
);
eq(
  "with signal, as before",
  [gate({ loading: true }), gate({ failed: true }), gate({})],
  ["checking", "failed", "in"],
);

// ---------------------------------------------------------------- the bar's time

{
  const now = Date.parse("2026-10-14T12:00:00Z"); // 15:00 in Nairobi
  eq(
    "today, a time; before, a day and time; nothing loaded, nothing",
    [
      lastLoadedText(Date.parse("2026-10-14T05:40:00Z"), now),
      lastLoadedText(Date.parse("2026-10-12T05:40:00Z"), now),
      lastLoadedText(Date.parse("2026-10-13T21:30:00Z"), now),
      lastLoadedText(0, now),
    ],
    ["at 08:40", "on 12 Oct at 08:40", "at 00:30", null],
  );
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx tsx --tsconfig tsconfig.json tests/offline-screens.test.ts`
Expected: FAIL: the run stops with `ERR_MODULE_NOT_FOUND` for `src/lib/offline/screens`.

- [ ] **Step 3: Write the rules**

Create `src/lib/offline/screens.ts`:

```ts
// What the screens do with no signal: which pages open, what the sign-in gate
// shows, and how the offline bar words the last load. Pure.

/** The pages that open with no signal; public/sw.js keeps copies of the same. */
export const OFFLINE_PAGES = ["/home", "/field", "/diary", "/voters", "/elections", "/strategy"];

/** What each offline page can't open without: the first part of its main query's key. */
const PAGE_DATA: Record<string, string> = {
  "/home": "home",
  "/diary": "diary",
  "/voters": "voters",
  "/field": "voters",
  "/elections": "atlas",
  "/strategy": "atlas",
};

/**
 * With no signal, whether a page has to say it needs signal: it's off the list,
 * or nothing it shows was saved (`hasData` says whether any query whose key
 * starts with the given name has data).
 */
export function needsSignal(pathname: string, hasData: (key: string) => boolean): boolean {
  const page = OFFLINE_PAGES.find((p) => pathname === p || pathname.startsWith(`${p}/`));
  const key = page ? PAGE_DATA[page] : undefined;
  return !key || !hasData(key);
}

export type GateState = "checking" | "in" | "failed" | "first-visit";

/**
 * The signed-in area's gate: saved access lets a person in whatever the
 * connection; with no signal and nothing saved, they're asked to open
 * Groundwork once with signal; with signal, the check runs as before.
 */
export function gateState(s: {
  /** Saved data has been put back (or there was none to put back). */
  ready: boolean;
  loading: boolean;
  failed: boolean;
  hasAccess: boolean;
  online: boolean;
}): GateState {
  if (s.hasAccess) return "in";
  if (!s.ready) return "checking";
  if (!s.online) return "first-visit";
  if (s.loading) return "checking";
  return s.failed ? "failed" : "in";
}

const hhmm = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Africa/Nairobi",
});
const dayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Africa/Nairobi",
});
const nairobiDay = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(ms);

/** "at 08:40" today, "on 12 Oct at 08:40" before; null when nothing has loaded. */
export function lastLoadedText(ms: number, now: number): string | null {
  if (!ms) return null;
  return nairobiDay(ms) === nairobiDay(now)
    ? `at ${hhmm.format(ms)}`
    : `on ${dayMonth.format(ms)} at ${hhmm.format(ms)}`;
}
```

- [ ] **Step 4: Run the test**

Run: `npx tsx --tsconfig tsconfig.json tests/offline-screens.test.ts`
Expected: `9 passed, 0 failed`.

- [ ] **Step 5: Tell React Query where it starts, and let saves fail at once**

React Query's `onlineManager` starts as online and only hears the `online` and `offline` events, so an app opened in airplane mode would try every load, fail it and show errors. Told at start, its loads wait for signal instead. Mutations get `networkMode: "always"`, so a save with no signal fails at once with the page's usual message. The field app's visit queue doesn't use React Query mutations, so it is unchanged.

In `src/router.tsx`, replace:

```tsx
import { QueryClient } from "@tanstack/react-query";
```

with:

```tsx
import { onlineManager, QueryClient } from "@tanstack/react-query";
```

Then replace:

```tsx
  if (typeof window !== "undefined") {
    startInstallable();
  }
  const queryClient = new QueryClient();
```

with:

```tsx
  if (typeof window !== "undefined") {
    // React Query only hears the browser's online and offline events, so it's told where it starts.
    onlineManager.setOnline(navigator.onLine);
    startInstallable();
  }
  // A save with no signal fails at once with the page's usual message, rather than waiting for signal.
  const queryClient = new QueryClient({ defaultOptions: { mutations: { networkMode: "always" } } });
```

- [ ] **Step 6: The bar and "This page needs signal"**

Create `src/hooks/useOnline.ts`:

```ts
import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

/**
 * Whether the phone has signal, as React Query sees it: the browser's online
 * and offline events, starting from navigator.onLine (set in src/router.tsx).
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
    () => true,
  );
}
```

Create `src/components/gw/offline/OfflineBar.tsx`:

```tsx
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
```

Create `src/components/gw/offline/NeedsSignal.tsx`:

```tsx
import { Link } from "@tanstack/react-router";

/** In place of a page that can't open with no signal, rather than loading forever. */
export function NeedsSignal() {
  return (
    <section className="view active" aria-label="Needs signal">
      <div className="card">
        <h2>This page needs signal</h2>
        <p className="f-note">
          It opens once you're back online. The field app and the pages you've opened before work
          without signal: <Link to="/field">Field app</Link> · <Link to="/home">Home</Link>
        </p>
      </div>
    </section>
  );
}
```

In `src/components/gw/ConsoleShell.tsx`, replace:

```tsx
import { InstallApp } from "./offline/InstallApp";
```

with:

```tsx
import { InstallApp } from "./offline/InstallApp";
import { OfflineBar } from "./offline/OfflineBar";
```

Then replace:

```tsx
        <div className="wrap">{children}</div>
```

with:

```tsx
        <div className="wrap">
          <OfflineBar />
          {children}
        </div>
```

Append to the end of `src/styles/gw-app.css`, by hand as before:

```css
/* No signal: the bar across the top of signed-in pages, empty (so hidden) with signal.
   Voters' full-screen map covers the shell's bar, so it carries its own, as a strip. */
.offline-bar {
  margin: 0 0 18px;
  padding: 10px 14px;
  border: 1px solid hsl(38 92% 56% / 0.55);
  border-radius: 10px;
  background: hsl(38 92% 56% / 0.14);
  font-size: 13px;
}
.offline-bar:empty,
.wrap:has(.vscreen) > .offline-bar {
  display: none;
}
.vscreen > .offline-bar {
  margin: 0;
  border-width: 0 0 1px;
  border-radius: 0;
}
```

- [ ] **Step 7: The entry check and the gate with no signal**

Saved access now lets the person in whatever the connection, and with signal a failed re-check no longer replaces a console already open. With no signal and no saved access, the gate asks for one visit with signal. A page off the list, or with nothing saved, says it needs signal. Nothing reads the `user` the entry check returns, so a stored session's user serves.

In `src/routes/_authenticated/route.tsx`, replace:

```tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import type { ReactNode } from "react";
```

with:

```tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
```

Then replace:

```tsx
import { GwMark } from "@/components/gw/GwMark";
import { useAccess } from "@/hooks/useAccess";
import { useSignOut } from "@/hooks/useSignOut";
import { canOpen, homeFor } from "@/lib/access";
```

with:

```tsx
import { GwMark } from "@/components/gw/GwMark";
import { NeedsSignal } from "@/components/gw/offline/NeedsSignal";
import { useAccess } from "@/hooks/useAccess";
import { useOfflineData } from "@/hooks/useOfflineData";
import { useOnline } from "@/hooks/useOnline";
import { useSignOut } from "@/hooks/useSignOut";
import { canOpen, homeFor } from "@/lib/access";
import { gateState, needsSignal } from "@/lib/offline/screens";
import { entryUser, phoneUser } from "@/lib/offline/session";
```

In `Authenticated`, replace:

```tsx
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (loading) {
```

with:

```tsx
  const { ready } = useOfflineData();
  const online = useOnline();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const gate = gateState({ ready, loading, failed, hasAccess: Boolean(access), online });

  if (gate === "checking") {
```

Then replace:

```tsx
  if (failed) {
```

with:

```tsx
  if (gate === "first-visit") {
    return (
      <Gate>
        <span className="eyebrow">Groundwork</span>
        <h1>You're offline.</h1>
        <p>Open Groundwork once with signal to use it offline.</p>
      </Gate>
    );
  }

  if (gate === "failed") {
```

Then replace:

```tsx
  const role = access?.role ?? null;
  return (
```

with:

```tsx
  const role = access?.role ?? null;
  // Whether any query whose key starts with `key` has data: what an offline page needs saved.
  const hasData = (key: string) =>
    queryClient
      .getQueryCache()
      .findAll({ queryKey: [key] })
      .some((q) => q.state.data !== undefined);
  return (
```

Then replace:

```tsx
      ) : canOpen(role, pathname) ? (
        <Outlet />
      ) : (
```

with:

```tsx
      ) : canOpen(role, pathname) ? (
        !online && needsSignal(pathname, hasData) ? (
          <NeedsSignal />
        ) : (
          <Outlet />
        )
      ) : (
```

And replace the entry check:

```tsx
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
```

with:

```tsx
  // With no signal, or a connection too weak to answer in time, the sign-in kept on the phone.
  beforeLoad: async () => {
    const user = await entryUser(() => supabase.auth.getUser(), phoneUser, navigator.onLine);
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
```

- [ ] **Step 8: Voters**

With no signal the map's place says "The map needs signal." (its base map and house tiles come from the network) and the panel shows the saved numbers. The People tab needs signal unless its list is already loaded. Voters' screen is fixed over the whole content area, covering the shell's bar, so it carries its own copy (the shell's is hidden by the CSS from Step 6, so one bar is announced).

In `src/routes/_authenticated/voters.tsx`, replace:

```tsx
import { AddPerson } from "@/components/gw/AddPerson";
```

with:

```tsx
import { AddPerson } from "@/components/gw/AddPerson";
import { OfflineBar } from "@/components/gw/offline/OfflineBar";
```

Then replace:

```tsx
import { useAccess } from "@/hooks/useAccess";
```

with:

```tsx
import { useAccess } from "@/hooks/useAccess";
import { useOnline } from "@/hooks/useOnline";
```

In `Voters`, replace:

```tsx
  const tab = search.tab === "people" && !isAgent ? "people" : "map";
```

with:

```tsx
  const tab = search.tab === "people" && !isAgent ? "people" : "map";
  const online = useOnline();
```

Then replace:

```tsx
  if (!data || (!config && !configFailed)) {
```

with:

```tsx
  // With no signal and no saved map settings, the page goes on without the map.
  if (!data || (!config && !configFailed && online)) {
```

On the People tab, replace:

```tsx
          <PeopleView
            rows={rows}
            record={record}
            loading={!people}
            search={search}
            onSearch={go}
            placeName={title}
            segments={people?.segments ?? []}
          />
```

with:

```tsx
          {!people && !online ? (
            <p className="f-note">The People tab needs signal.</p>
          ) : (
            <PeopleView
              rows={rows}
              record={record}
              loading={!people}
              search={search}
              onSearch={go}
              placeName={title}
              segments={people?.segments ?? []}
            />
          )}
```

On the map, replace:

```tsx
      <div className="vscreen">
        {bar}
        {mapArea ? (
```

with:

```tsx
      <div className="vscreen">
        {/* The screen covers the shell's bar, so it carries its own. */}
        <OfflineBar />
        {bar}
        {mapArea && online ? (
```

And where the map would be, replace:

```tsx
                {configFailed
                  ? "Could not load the map's settings. Try reloading."
                  : isAgent
                    ? "No map for this campaign yet: its area's houses aren't loaded."
                    : "No map for this campaign yet: its area's houses aren't loaded. The People tab works as before."}
```

with:

```tsx
                {!online
                  ? "The map needs signal."
                  : configFailed
                    ? "Could not load the map's settings. Try reloading."
                    : isAgent
                      ? "No map for this campaign yet: its area's houses aren't loaded."
                      : "No map for this campaign yet: its area's houses aren't loaded. The People tab works as before."}
```

- [ ] **Step 9: The field app**

The field app already follows the browser's online state (`online`). With no signal and no list loaded, the note says so; the "Could not load" note shows only with signal, so the two never show together.

In `src/components/gw/FieldApp.tsx`, replace:

```tsx
          {isError && (
            <p className="f-note">
              Could not load the walk list. New people can still be signed up.
```

with:

```tsx
          {isError && online && (
            <p className="f-note">
              Could not load the walk list. New people can still be signed up.
```

Then replace:

```tsx
          {!list && isFetching && <p className="f-note">Loading {ward?.name ?? "the ward"}…</p>}
```

with:

```tsx
          {!list && isFetching && <p className="f-note">Loading {ward?.name ?? "the ward"}…</p>}
          {!list && !online && (
            <p className="f-note">
              The list needs signal. You can still add someone you meet at the door.
            </p>
          )}
```

- [ ] **Step 10: Check**

Run: `npx tsc --noEmit && npx eslint src/lib/offline/screens.ts src/hooks/useOnline.ts src/components/gw/offline/OfflineBar.tsx src/components/gw/offline/NeedsSignal.tsx src/router.tsx src/routes/_authenticated/route.tsx src/components/gw/ConsoleShell.tsx src/routes/_authenticated/voters.tsx src/components/gw/FieldApp.tsx tests/offline-screens.test.ts && npx prettier --check src/lib/offline/screens.ts src/hooks/useOnline.ts src/components/gw/offline/OfflineBar.tsx src/components/gw/offline/NeedsSignal.tsx src/router.tsx src/routes/_authenticated/route.tsx src/components/gw/ConsoleShell.tsx src/routes/_authenticated/voters.tsx src/components/gw/FieldApp.tsx tests/offline-screens.test.ts && for t in tests/sw.test.ts tests/offline-*.test.ts; do npx tsx --tsconfig tsconfig.json $t || exit 1; done`
Expected: no type errors, no lint output, `All matched files use Prettier code style!`, then `31`, `5`, `17`, `9` and `13 passed, 0 failed` (`sw` first, then `offline-app`, `offline-saved`, `offline-screens` and `offline-session`).

- [ ] **Step 11: Commit**

```bash
git add src/lib/offline/screens.ts \
  src/hooks/useOnline.ts \
  src/components/gw/offline/OfflineBar.tsx \
  src/components/gw/offline/NeedsSignal.tsx \
  src/router.tsx \
  src/routes/_authenticated/route.tsx \
  src/components/gw/ConsoleShell.tsx \
  src/routes/_authenticated/voters.tsx \
  src/components/gw/FieldApp.tsx \
  tests/offline-screens.test.ts \
  src/styles/gw-app.css
git commit -m "$(cat <<'EOF'
Offline: the bar, pages that need signal, the sign-in check with no signal, Voters and the field app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 5: A look in the preview, the whole check, and the release

**Files:**
- None, unless a check finds a fault (fixed test-first, in the task that owns the code).

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: A look in the preview**

The scratch preview harness (not committed, at `/private/tmp/claude-501/-Users-mac-Documents-groundworkkenya/9e024926-7115-4f1e-aae5-61f2ca1b5162/scratchpad/harness`) draws the signed-in screens against an in-memory Supabase. Start it with `preview_start` and the name `home-harness`. It reads the repository from the working directory.

Its `main.tsx` already does two things: `?offline` starts it with no signal, and it calls `startInstallable()`. It doesn't run `src/router.tsx` or `src/routes/__root.tsx`, so saved data, the head's manifest switch and React Query's start state aren't in the preview; the phone check covers them.

A stand-in install offer is `const e = new Event("beforeinstallprompt", { cancelable: true }); e.prompt = async () => {}; window.dispatchEvent(e)`. Signal is switched with `window.dispatchEvent(new Event("offline"))` and `new Event("online")`.

Expected:
- **Voters:** at `/voters`, after "offline", there is one visible bar, "You're offline: showing what was last loaded at HH:MM. Changes need signal.", as a strip above the Voters header. The map's place reads "The map needs signal." and there is no `.maplibregl-canvas`.
- **The field app:** at `/field`, after "offline" and choosing a ward, the note reads "The list needs signal. You can still add someone you meet at the door." and "Could not load the walk list" doesn't show.
- **Needs signal, then back online:** at `/home`, after "offline", the menu's Diary link opens "This page needs signal" under the bar. After "online", the bar is empty and hidden, and the Diary loads.
- **A first visit with no signal:** `/home?offline` shows the gate "You're offline." with "Open Groundwork once with signal to use it offline."
- **The install button:**
  - At 1280 wide, with the stand-in offer, "Install the app" sits under Sign out in the sidebar's foot.
  - At 375 wide, it sits in the phone menu's footer, in line with Sign out.
  - On `/field`, every install button reads "Install Groundwork Field", the page's own included. Pressing one calls `prompt` once, and the buttons go.
- **Phone width (375):** no sideways scroll on `/home`, `/voters` or `/field`.

Then reset the viewport to desktop and stop the preview.

- [ ] **Step 2: The whole check**

Run: `npm test && npm run build && git diff --name-only main...HEAD -- '*.ts' '*.tsx' | xargs npx eslint && git diff --name-only main...HEAD -- '*.ts' '*.tsx' '*.js' '*.html' '*.webmanifest' | xargs npx prettier --check`

Expected:
- Every tsx file reports `0 failed`, including `sw` (31 passed), `offline-app` (5), `offline-saved` (17), `offline-screens` (9) and `offline-session` (13).
- Every SQL file reports `ok`.
- The build passes, and `.output/public` holds `sw.js`, `offline.html` and `field.webmanifest`.
- There is no lint output, and Prettier prints `All matched files use Prettier code style!`.

- [ ] **Step 3: Hand the release to the user**

Don't push. Tell the user the branch is ready and ask whether to push it or merge it to `main`. There is no migration this time.

Once it's live, the user checks on a phone, as the spec's last test says:
1. With signal, open the live site and install both apps:
   - Android Chrome: the menu's "Install the app", or "Install Groundwork Field" on the field page.
   - iPhone Safari: Share, then Add to Home Screen, once from Home and once from the field page.
2. Open each app once with signal, then switch to airplane mode.
3. Open both. Groundwork shows Home under the bar; Groundwork Field opens the field app.
4. Record a door for someone met there, and open Voters and the Diary.
5. Reconnect: the door syncs, and the bar goes.
6. With no signal, sign out, then reopen the app: it asks to sign in.

If a phone won't install the second app, or the field page's install button installs "Groundwork" instead, report it before changing anything: two installs sharing one scope rely on the browser keeping their ids apart.
