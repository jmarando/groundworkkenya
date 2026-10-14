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
