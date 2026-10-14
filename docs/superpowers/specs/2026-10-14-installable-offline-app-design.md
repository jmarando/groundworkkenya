# The installable offline app

Status: designed with the user on 14 October 2026; this spec awaits their review.

## Why

Field teams work where the signal drops. Today Groundwork can be added to a phone's home
screen, but with no signal it doesn't open at all: the page, the sign-in check (role and
campaign) and the ward list all come from the server first. Once the field page is open,
doors already queue on the phone and sync later; getting to that page is the problem.

The candidate and campaign manager also want the pages they read most (Home, the Diary,
Voters' numbers, Elections, Strategy) to open on the road with what was last loaded.

## Decisions

- **One codebase, two installs:** "Groundwork" opens Home; "Groundwork Field" opens the
  field app. The same sign-in, rules and releases.
- **Offline:** the field app works, and Home, the Diary, Voters' numbers and doors,
  Elections and Strategy open with what was last loaded. Everything else says it needs
  signal.
- **Approach:** a small hand-written background file (a service worker) keeps the app's
  files; the app itself saves the listed pages' data on the phone, with what a page doesn't
  need removed. No build plugin: Lovable's build setup stays as it is.
- **Not in this piece:** app-store apps; offline maps (keeping a walk list's houses for no
  signal belongs to the walk lists design); notifications (their own small piece after walk
  lists, starting with "You've been given a walk list"); keeping walk lists on the phone;
  syncing visits while the app is closed; satellite or street maps offline.

## 1. What people get

- **Installs:** an "Install the app" button where the phone's browser offers installs
  (Android, computers); on iPhone a short note: "Share, then Add to Home Screen". Both hide
  once the app runs installed. The button sits in the menu and on the field page; from the
  field page it installs "Groundwork Field".
- **With no signal:**
  - The field app opens with the wards from the last load. Agents record doors for the
    people they meet; visits sync when signal returns, as now. Where the street's list
    would be: "The list needs signal. You can still add someone you meet at the door."
  - Home, the Diary (the weeks opened before), Voters (numbers and doors; the map says
    "The map needs signal"), Elections and Strategy open with what was last loaded.
  - A bar across the top: "You're offline: showing what was last loaded at 08:40. Changes
    need signal."
  - Any other page says "This page needs signal" instead of loading forever.
  - A page never opened with signal has nothing saved, so it isn't available offline.
- **Saving while offline** fails at once with the page's usual "couldn't save" message,
  rather than waiting and running hours later. The field app's visit queue is separate and
  unchanged.

## 2. The background file (`public/sw.js`)

Plain JavaScript, served at `/sw.js`. One function decides what each request is:

- **A page** (a same-origin navigation): from the network first, so a new release shows at
  once. A copy is kept of the offline pages (`/home`, `/field`, `/diary`, `/voters`,
  `/elections`, `/strategy`), whatever their search part (`?area=…`). With no signal, the
  kept copy; a page with no copy gets `/offline.html`.
- **An app file** (same-origin `/assets/…`): from the phone first, since a released file's
  name never changes; fetched and kept when missing. At most 300 are kept, oldest dropped.
- **Kept and refreshed in the background:** same-origin `/brand/…`, `/geo/…`, the house
  files' counts (`/tiles/….json`, never the `.pmtiles` house files), `/favicon.ico` and the
  two manifests, and Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`).
- **Never kept:** everything else, straight to the network: every server function
  (`/_serverFn/…`), `/api/…`, Supabase, house tiles (`/tiles/…`), MapTiler, anything not a
  GET, and range requests.

On install it keeps `/offline.html`, `/home` and `/field`, and the app files those two pages
name, so the first offline open works after a single visit with signal. On activate it
deletes older versions' stores and takes charge of open pages at once, so the files they
load next are kept too. Store names carry a version (`gw-pages-v1`, `gw-files-v1`,
`gw-refresh-v1`); a release can ship a `sw.js` that clears its stores and removes itself.

`/offline.html` is a small branded page: "You're offline. The field app and the pages you've
opened before work without signal." with links to `/field` and `/home`.

The pages it keeps carry no personal data: signed-in pages are drawn in the browser
(`ssr: false`), so the server's page is the same shell for everyone.

**Where it runs:** the app registers it in the browser after load, only on `groundwork.ke`
and its subdomains, and on `localhost` when testing asks for it (`?sw=1`). Never in Lovable's
preview or the dev server.

## 3. The two installs

- `public/site.webmanifest` gains `"id": "/"` and opens at `/home` (`start_url`); name
  "Groundwork".
- New `public/field.webmanifest`: name "Groundwork Field", short name "Field", `"id":
"/field"`, `start_url` `/field`, `scope` `/`; the same icons and colours.
- The root head links `field.webmanifest` on `/field` and `site.webmanifest` everywhere
  else, so an install from the field page is the field app. AGENTS.md's note that the root
  head provides one shared manifest is updated to say so.
- **Install button** (`InstallApp`): keeps the browser's install offer
  (`beforeinstallprompt`) and shows "Install the app" ("Install Groundwork Field" on the
  field page); on iPhone and iPad, which have no such offer, the Share note; nothing when
  already running installed (`display-mode: standalone`, or `navigator.standalone`).

## 4. Saved page data

Kept in the browser's IndexedDB (database `groundwork-offline`) through a small wrapper. If
the browser refuses storage, nothing is saved and the app works online as today.

**What is saved, by React Query key:**

| Key                         | Saved                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `["my-access"]`             | as loaded: the person's own role and campaign                                                      |
| `["home", campaign]`        | as loaded                                                                                          |
| `["diary", campaign, week]` | as loaded, each week opened                                                                        |
| `["voters"]`                | `wards` and `totals` only; `people` and `feed` emptied                                             |
| `["canvassing"]`            | `totals`, `wards`, `issues`, `unplaced`; `walkList` and `recent` emptied                           |
| `["area-doors"]`            | as loaded (counts per ward)                                                                        |
| `["atlas"]`                 | as loaded                                                                                          |
| `["findings", campaign]`    | as loaded                                                                                          |
| `["map-config"]`            | as loaded: the campaign's map area and the map's settings, which Voters and the field app wait for |

- Each successful load of a listed query is saved, at most once a second per key, with the
  time it loaded.
- A record of whose data it is (user, campaign) and a format version sits beside it.
- **On start**, in the browser: when the person and campaign and version match, every saved
  entry goes back into the query cache with its load time, so it counts as old and
  refreshes as soon as there is signal; entries older than 14 days are deleted instead.
  When anything doesn't match, everything saved is deleted.
- **On sign-out**, everything saved is deleted.
- Mutations stop waiting for the network (React Query's `networkMode: "always"`), so a save
  offline fails at once.

## 5. Offline screens

- `useOnline()` follows the browser's online and offline events.
- **The bar** sits at the top of every signed-in page while offline; its time is the last
  successful load of a saved query.
- **Pages off the list** show "This page needs signal" while offline.
- **The sign-in check:** when Supabase can't be reached, the signed-in area's entry check
  takes the session already on the phone instead of sending the person to sign in, and with
  saved access the gate lets them in; without saved access: "Open Groundwork once with
  signal to use it offline."
- **Voters:** the map's place shows "The map needs signal"; the panel shows the saved
  numbers. The People tab needs signal.
- **The field app:** the ward list comes from the saved Voters copy; the street's list shows
  the note above.

## Privacy

- **Never on a phone:** the voter file (names, phone numbers), the recent-contacts feed,
  suggested walk lists and recent visits with names, house visit details, the People tab,
  Inbox, Finance and Broadcast.
- **On a phone:** the app's files; the listed pages' data (campaign figures, the diary, the
  team's notes and profiles of places, findings, rivals' names and public posts); the
  person's own access; the visit queue (as today). Only what that person could already see.
- Wiped at sign-out and when another person or campaign signs in; nothing older than 14
  days is kept.
- Field agents' phones hold only their access, the ward list and their visit queue.
- The background file never keeps a server's data response.

## Errors

- Storage refused: online only, no errors.
- Saved data a newer release can't read: its format version doesn't match, so it's deleted.
- A release while offline: the old copy runs until signal returns, then everything
  refreshes.
- A faulty background file: a release ships one that clears its stores and removes itself.

## Testing

- **The background file:** loaded in a test with stand-ins for the browser's cache, fetch
  and clients. Which kind each request is (every rule above); what install keeps (the
  offline page, `/home`, `/field` and their app files); a kept page served offline, search
  part or not; `/offline.html` for a page never kept; network-only requests never stored;
  the 300-file limit; older stores deleted on activate.
- **Saved data:** what each key keeps and strips; the 14-day expiry; deletion on sign-out
  and on another person or campaign or format; entries restored with their load time.
- **The manifests:** valid, with their ids and start pages.
- **The sign-in check:** with saved access and no signal, the person gets in; without, the
  note.
- **Preview** (desktop and phone width): the bar, "This page needs signal", the Voters map
  note, the field app's note, the install button and the iPhone note.
- **A real phone, after release** (the user): install both apps from the live site, switch to
  airplane mode, open both, record a door, reconnect and see it sync. The production build
  only runs on Cloudflare, so this is the end-to-end proof.

## Success

- In airplane mode, both installed apps open; the field app records a door that syncs on
  reconnecting; the listed pages show their saved data under the bar; other pages say they
  need signal.
- Nothing on the "never on a phone" list is ever saved.
- Lovable's preview and the dev server never run the background file.

## Build order

1. The background file, the offline page and their tests.
2. Registration, the two manifests, the head's switch, and the install button.
3. Saved page data and its tests, wired into the app's start.
4. The offline screens: the bar, "needs signal", the Voters and field notes, the sign-in
   check, mutations failing fast.
5. A look in the preview; the release; the user's check on a phone.

## Next, as agreed

1. Walk lists (the Voters map's part 3), including keeping a list's houses for no signal.
2. Notifications, starting with "You've been given a walk list".
