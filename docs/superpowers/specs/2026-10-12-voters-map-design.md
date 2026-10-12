# Voters map: from the county to the doorstep

Status: designed with the user on 2026-10-12, from a clickable mockup they approved
(https://claude.ai/artifact/CTLUWsnLsmYG8JpRP4vUPf). Decisions: houses for each campaign's
own area (Nairobi County for Sakaja and Kalonzo, Mathira for Mathira); polling centres
placed automatically where possible, agents confirm; walk lists drawn on the map or taken
from a suggestion; an agent's list works with no signal and their map when online; 2022
results for every polling station; our own house layer, not a paid tile service. Built in
four parts (section 9), one plan each.

## Why

The Voters screen draws the data nicely but stops at the ward and gives no next step.

- **Zoom fights the page.** The map is a 640-pixel box inside a page that scrolls, so the
  wheel and a pinch move the page or the map by turns. Zooming to an area stops at 16.5,
  and the bounds and the ward file are Nairobi's whatever the campaign
  (`WardMap.tsx:55-58`, `VotersMap.tsx:103-107`).
- **No houses.** Outlines exist for one ward, Kileleshwa (11,708, in one 2.9 MB file).
- **No polling stations.** `polling_stations` has no position. Sakaja's 85 rows are
  samples (PS-0001 to PS-0085, one invented school per ward); Mathira and Kalonzo have
  none.
- **No 2022 result below the county.** The atlas holds the 2022 presidential result for
  Nairobi as a whole and nothing per constituency, ward or station.
- **No next step.** A "walk list" is a CSV of people, the street plan is a list of street
  names with a typed-in agent, and the map's selection tray promises walk lists "next".

## What it has to do

1. An organiser goes from the campaign's whole area to one house with the wheel, a pinch
   or a click, and every house in the area is on the map.
2. Every polling centre is on the map with its streams, registered voters and 2022
   result, and says how its position was found.
3. The screen says what to do next, ranked, and each item leads to a walk list.
4. A walk list is drawn or suggested, put in walking order and given to an agent; its
   doors change colour as visits come in.
5. An agent works through their walk lists on their phone, door by door, with no signal,
   and sees the map of their doors when they have one.

## 1. The screen

### Layout

The map fills the screen below the app's header and the page does not scroll. A panel on
the right (340 to 440 pixels) scrolls on its own. Below 1,100 pixels wide, the panel
becomes a sheet over the bottom of the map that drags up to half or full height. Above the
map sit the crumbs (Nairobi County / Roysambu / Roysambu ward / Garden Estate Primary
School) and one search box.

Why: a map that owns the screen has no page to fight, so the wheel and a pinch always go
to the map.

### Levels

The level follows the zoom, so scrolling in and clicking in land in the same place.

| Level         | Zoom     | Drawn                                                                            | A click                             |
| ------------- | -------- | -------------------------------------------------------------------------------- | ----------------------------------- |
| Campaign area | 8 to 11  | Wards, shaded by the chosen colour; constituency outlines                        | Flies into the ward or constituency |
| Constituency  | 11 to 13 | Its wards, named                                                                 | Flies into the ward                 |
| Ward          | 13 to 16 | Polling centres sized by registered voters; the area nearest each centre, shaded | Opens the centre                    |
| Street        | 16 to 20 | Every house, coloured; walk lists outlined; a chosen list's doors numbered       | Opens the house                     |

Mathira's area is one constituency, so it starts at the constituency level. The map's
bounds are the area's, with a margin.

### The panel

At the top, the area's five numbers as today's ladder has them (registered, on file,
supporters, doors in 30 days, coverage) and the area's notes (`LastTimeHere`). Below, what
follows the selection:

- **An area (campaign, constituency or ward).** "Do this next" (section 5): up to six
  ranked centres or wards, each with its tag, one line of why in numbers, and one button
  ("Plan walk lists" or "Open the centre"). Under it: walk lists out, doors this week,
  agents out today. In a ward, its centres follow as a list: name, streams, registered
  voters, 2022 result (our share, margin in votes), turnout against the ward's, tag, and
  houses knocked in 30 days around it. Centres without a position are listed under "Not on
  the map yet" with "Place it".
- **A centre.** Its 2022 result and turnout against the ward, the houses around it and how
  many were knocked, supporters found there, its walk lists, where its position came from,
  and "Plan a walk list here".
- **A house.** Who is on file there, its visits (date, agent, outcome, support, issue) and
  the walk list it is on. In the densest settlements the outline is often a block of
  homes (section 4), and the card says so.
- **Planning a walk list.** Section 3.

A second tab, **People**, is today's People view filtered to the area on show, with "Add a
person", "Manage records", "Message these people" and the people CSV (renamed from "Walk
list · CSV" to "People list · CSV", since a walk list is now a set of doors). Agents do
not see this screen (section 7).

### Colour, base map, search, address

- **Colour by:** 2022 vote (our share), Doors (share of houses knocked in 30 days; a house
  takes its last outcome) and Support (supporters among doors answered; a house takes its
  last score). The legend follows. Where forms are not read yet the area is grey and says
  "Form not read yet"; nothing is guessed.
- **Base:** Satellite or Streets from MapTiler with the campaign's key; without a key, the
  free street map and no Satellite button.
- **Search** finds wards, centres, places and streets (MapTiler's search, when the key is
  set) and people on file; a person flies to their house when it is known.
- **The address** keeps the area, centre, house, walk list, colour, base and tab, so a link
  or a reload opens the same view. Old links keep working: `view=people` opens the People
  tab; `view=doors` and `view=wards` open the map.

## 2. The agent's phone

The field app opens on **Your walk lists**: each list given to the agent, its centre, how
many doors are done, and when it was given. Opening one shows:

- **A header:** the list's name, "15 of 44 done", a progress bar, and, with no signal, "No
  signal · 3 visits saved on the phone, they send when it comes back".
- **The map of the doors,** numbered in walking order and coloured by outcome, the next
  door ringed, the agent's position shown. With no signal: "Map needs data · your list
  doesn't", and the list carries on.
- **This door:** its number, who is on file there, the last visit; then Spoke, Not home or
  Refused. Spoke opens support 1 to 5, the campaign's issues, and "Add them" (name and
  phone, with "Agrees to texts from the campaign"). "Save · go to door 16" saves and moves
  on. A door can be skipped and come back to.

When a list is opened online, its doors, order, house outlines, the names on file there and
the last visits are saved on the phone, so it works in a basement or a valley. Visits join
the field app's existing queue (`lib/field.ts`), which sends them when there is signal and
never twice.

**Finding the house.** "Which house am I at?" now works everywhere in the campaign's area,
not just Kileleshwa: the phone reads the houses around its position from the house file
(section 4) and keeps today's rule, the nearest outline within 30 metres when the position
is good to 50 metres, else a tap on one within 80 (`lib/geo.ts`, `useDoorPlace`). With no
signal it uses the houses saved with the walk list.

**Confirming a centre.** At a polling centre, "Polling centres near me" lists the centres
within 2 km by distance; "I'm here" on the right one makes the phone's position the
centre's when it is inside the centre's ward (or within 300 metres of it) and good to 50
metres; otherwise it is kept as a suggestion for an organiser. This needs a signal.

Street plans give way to walk lists: the street-plan screen and the field app's list of
streets go; the `canvass_streets` table and its rows are left as they are.

## 3. Walk lists

**Two ways to start,** both at street level:

- **Use the suggested patch:** the 50 houses nearest the centre, or nearest a point the
  organiser taps, that are in that centre's area, not knocked in 30 days and not on another
  open list.
- **Draw around houses:** tap points to draw a shape; every house whose centre is inside
  is on the list. Over 150 houses, the organiser is asked to split it.

**Walking order.** A nearest-neighbour walk from the centre (or the first door), then
improved by reversing stretches of it while that shortens the walk (2-opt), on straight-line
distances between house centres. No road network: agents walk a street and its lanes, and
this keeps neighbours together.

**Giving it out.** The organiser names the list (by default the centre's name and a
number), picks an agent (each shown with the doors still open on their lists), and sends
it. The agent sees it on their phone at once. A list is a draft, out (with an agent), or
done (every door has a visit since it went out, or the organiser closes it).

**On the map,** open lists are outlined, a chosen list's doors are numbered, and each door
takes the colour of its latest visit as visits arrive.

Who: the candidate, managers and organisers plan and give out lists; an agent reads only
the lists given to them.

## 4. Data

### Houses

- **Source:** Google Open Buildings v3 (CC BY 4.0), the S2 cell that covers Nairobi and
  Nyeri (`183_buildings.csv.gz`), with today's rule from `scripts/geo/ward_buildings.py`:
  confidence 0.65 or more, and the outline's centre inside one of the area's wards.
- **Counts:** Nairobi 805,234 houses over 85 wards (Ruai the most, 71,025); Mathira
  141,692 over 6 wards.
- **Files:** one PMTiles file per area, built by a script in `scripts/geo` like the others:
  vector tiles at zoom 16 only, one layer (`buildings`), one property per house (`pc`, its
  plus code, which stays the house's id as the door app already records it), tiles 1,024
  units across, gzip. Measured: Nairobi 14.9 MiB in 1,619 tiles, Mathira 2.6 MiB in 827.
  They are served with the app from `public/tiles/houses-nairobi.pmtiles` and
  `public/tiles/houses-mathira.pmtiles`; `public/geo/buildings/` goes.
- **Serving:** the app's host, Cloudflare, answers ranged requests (a ranged GET for
  `/geo/buildings/kileleshwa.json` on groundwork.ke returns 206), which PMTiles needs, and
  takes static files up to 25 MiB. MapLibre reads the files through the `pmtiles` protocol
  and draws houses from zoom 16, stretching the zoom-16 tiles up to 20.
- **Limits, said where they matter:** in the densest settlements the dataset outlines
  blocks rather than homes (Laini Saba ward has 410 outlines), so agents there log each
  household at a structure as its own visit. Ward shapes are geoBoundaries' and rough at
  the edges, so near an edge a house can sit in a different ward from IEBC's.

Why: two files served with the app cost nothing per view and need no keys or uploads;
ward-by-ward GeoJSON like Kileleshwa's would be about 200 MB for Nairobi.

### The campaign's map area

`atlas_settings` gains `map_area`, the atlas key of the area the Voters map covers:
`nairobi` for Sakaja and Kalonzo, `nyeri/mathira` for Mathira. The app maps it to its ward
shapes (`public/geo/nairobi-wards.json`, `public/geo/mathira-wards.json`) and its house
file. Kalonzo's workspace gets Nairobi's 85 wards (registered voters from the register,
no targets) so the map, the centres and the people have wards to hang on. A campaign with
no map area sees a line saying so, not Nairobi.

### Polling centres and streams

- **Source:** IEBC's 2022 register by polling station (`rov_per_polling_station.pdf`, 712
  typed pages): ward, centre code and name, stream code, registered voters. A stream code
  is 15 digits: county (3), constituency (3), ward (4), centre (3), stream (2); the
  centre's code is its first 13. Nairobi has 376 centres and 3,627 streams; Mathira 109
  and 201. Long centre names run into the code column in the PDF's text, so the reader
  finds codes by their 15 digits, not by column.
- **Checks:** each ward's streams add up to the ward's registered voters in the atlas
  (`data/atlas/<county>/register.csv`), and every IEBC ward name maps to one of our wards
  (a short list of known spellings, as `scripts/geo/nairobi_wards.py` keeps); the loader
  stops on anything it cannot match.
- **Stored:** in `polling_stations`, per campaign, as today: one row per centre, with
  `streams` and `registered_voters` from the register and a new `iebc_code` (the 13
  digits). `code` stays the short code agents key on USSD and write on a form's photo
  ("34A PS-0012/2", `lib/form34a.ts`), numbered PS-0001 upwards in IEBC's order. Sakaja
  and Kalonzo get Nairobi's 376, Mathira its 109. Sakaja's 85 sample rows are removed when
  the real ones load; a sample row someone has filed a result on, or staffed with an agent
  other than the seeded "Agent <ward>", is kept with its code changed to SAMPLE-0001
  onwards, for the team to sort out. The war room, the agents page and Form 34A filing
  keep working on the same table.
- **Position:** `polling_stations` gains `lat`, `lng`, `placed_by` (`osm`, `osm-close`,
  `organiser`, `agent`), `placed_accuracy_m`, `placed_at` and `placed_actor`. Positions are
  each campaign's own: one campaign's agents never move another's pins.

### Where the centres are

1. **OpenStreetMap names** (the Humanitarian OpenStreetMap Team's Kenya education export,
   ODbL): a centre takes a school's position when their names match without words like
   "primary school", the school is inside the centre's ward or within 2 km of it, and they
   are not one primary and one secondary. A first test on 367 of Nairobi's centres placed
   169 this way and found a close name for 67 more; it placed 7 of Mathira's 109, because
   Mathira's rural schools are mostly not in OpenStreetMap.
2. **An organiser's pin:** "Place it" drops a pin at the ward's centre to drag where it
   belongs.
3. **An agent's "I'm here"** (section 2), which also confirms a position found by name.

A close-name position shows as a hollow pin until someone confirms it. A centre with no
position is listed, not drawn. The positions found from OpenStreetMap carry its attribution
and are published under ODbL in `data/stations/`.

### The area nearest each centre

When a ward opens, each placed centre gets the part of the ward nearer to it than to any
other centre (a Voronoi cell, cut to the ward's shape), worked out in the browser. The
legend calls it "nearest centre": IEBC publishes no station boundaries. Houses take their
centre by the same rule, and "houses around it" and the suggested patch use it.

### 2022 results by polling station

- **Source:** IEBC's presidential Form 34B for each constituency, from the forms portal:
  Nairobi's 17 and Mathira's, all downloaded. One row per stream: registered voters, the
  four candidates' votes, valid votes and rejected ballots.
- **Reading:** Roysambu's form has a text layer. The rest (and the part of Embakasi East's
  that its text layer misses) are clean printed tables scanned at 200 dpi, about 58 rows to
  an A3 page, 2 to 4 pages a constituency, and are read row by row once, as a data task
  outside the app. A row is kept when its candidates add up to its valid votes and its
  registered voters equal the register's for that stream; each constituency's rows must add
  up to the form's totals, and Nairobi's constituencies to the county figures the atlas
  already has (Odinga 767,395, Ruto 561,775). A row that fails is held back, and its
  centre shows "Form not read yet".
- **Stored in the atlas,** which is public and shared like the rest of it: `atlas_areas`
  gains a `centre` level (key: the ward's key plus the centre code, so four segments), and
  the 2022 presidential results and turnout are loaded for centres, wards and
  constituencies (wards and constituencies as sums of their centres), through the atlas's
  usual files and loader. The stream rows stay in the data folder for anyone to check.
- **Our side** is the campaign's `atlas_sides` choice for 2022-president; without one the
  vote colour asks for it.

### Door visits and houses

Today a door visit is a `person_events` row, so a door where nobody gives a name and phone
leaves no trace. A new `house_visits` table records every door knocked: the house's plus
code, its ward, outcome, support, issue, the walk list, the agent, when, where, and the
person when there is one, with the phone-made id that keeps a retried sync from counting
twice. `record_door` writes one for every visit that has a house, so a visit that names a
person goes on their record as today and on the house too; part 3 adds visits with no
person. Door events already on record with a house are copied in once. The Doors and
Support colours, "houses knocked" and the walk lists' progress all read `house_visits`.

The house script also writes the number of houses in each ward next to each house file,
which coverage ("share of houses knocked") divides by.

## 5. What to do next

The atlas's rule (`whatToDo` in `lib/atlas.ts`), applied to centres with their ward as
the parent, first match wins: our share 50% or more and turnout over 3 points below the
ward's is Mobilise; 60% or more is Hold; behind by more than 10 points is Cut the gap;
within 10 points is Persuade; otherwise Lean ours. There is no 2017 result by station, so
no swing. Centres are ranked by the atlas's votes within reach (`votesWithinReach`, the
ward's other centres as siblings), with ties going to the centre with fewer houses
knocked. Wards use the same rule against their constituency.

Until a constituency's forms are read, its wards stand in with "Doors first": the wards with
the most houses not knocked in 30 days.

## 6. The map itself

- One MapLibre map for every level, grown from today's `WardMap`: zoom 8 to 20, bounds from
  the campaign's map area, wheel and pinch zoom on, and zooming to an area allowed down to 18.
- Houses come from the area's PMTiles file. A house's colour is set by its plus code
  (MapLibre feature state) for the houses visited in 30 days in the area on show; the
  rules are today's (`lib/wardmap.ts`).
- The nearest-centre areas need two small libraries (`d3-delaunay` for the cells,
  `polygon-clipping` to cut them to the ward); the phone's house lookup needs a vector-tile
  reader (`@mapbox/vector-tile`, `pbf`).
- The map credits MapTiler and OpenStreetMap (base), Google Open Buildings (CC BY 4.0),
  OpenStreetMap (centre positions, ODbL) and IEBC (results).

## 7. Access

- Agents work in the field app only: `/voters` leaves their pages in `canOpen()`
  (`lib/access.ts`), which leaves them the field app and Foundations. The field app gives
  them their walk lists, the houses on them, the names on file there with masked phones,
  and the centres near them.
- `walk_lists` and their doors follow the campaign rules in AGENTS.md (`campaign_id`,
  "own campaign only"); the candidate, managers and organisers read and write them; an
  agent reads the lists given to them and nothing else.
- `house_visits` are written the way door visits are today, through `record_door`; an
  agent reads only the visits at the houses on their own lists.
- "I'm here" goes through a database function that checks the campaign, the ward
  distance and the accuracy, records who and when, and keeps a suggestion when a check
  fails.

Not in this design, and worth its own fix: row-level security still lets an agent read
every person in their campaign with full phone numbers (`20260922140745_*.sql:27-35`), and
`getVoters` sends them to the field app. The homepage's "least privilege" promise depends
on closing that.

## 8. Testing

As the repo does it: plain `tests/*.test.ts` scripts run by `npm test`, then the SQL tests
(`tests/sql/run.sh`).

- **Rules:** the level for a zoom; the address round trip, old `view=` links included;
  walking order (a known short walk, and 2-opt never lengthening it); the suggested patch
  (nearest 50, skipping knocked and listed houses); nearest-centre cells cut to a ward; a
  house's colour from its visits; "Do this next" at centre level, with the atlas's own
  cases.
- **Data:** the house script reports houses per ward, fails if a ward has none or a file
  is over 25 MiB; the centre loader's register and ward checks; the forms' row, total and
  county checks.
- **Database:** an agent reads only their own walk lists and doors, and another campaign's
  none; an agent cannot create or give out a list; `record_door` writes a house visit
  when the visit has a house, and a repeated visit is ignored; "I'm here" from beyond the
  ward's 300 metres, or worse than 50 metres, leaves the position alone and keeps a
  suggestion; the sample stations' removal keeps a row with a filed result.
- **By hand:** county to a single house with a wheel, a trackpad and a pinch on a phone;
  a walk list end to end on a phone in airplane mode.

## 9. Build order

Each part ships on its own and leaves the screen working.

1. **The map, down to the house.** The full-screen layout, levels and zoom; the campaign's
   map area (Kalonzo's wards included); house files for Nairobi and Mathira, with houses
   per ward; `house_visits`; colour by Doors and Support; the house card; the People tab;
   "Doors first"; "Which house am I at?" everywhere.
2. **Polling centres.** The register loaded into `polling_stations`, the sample rows
   replaced, positions from OpenStreetMap names, "Place it", "I'm here", the nearest-centre
   areas and the centre card without results.
3. **Walk lists.** Visits with no person, the suggested patch and drawing, walking order,
   giving a list out, doors colouring in; "Your walk lists" on the phone, saved for no
   signal; street plans retired; agents out of `/voters`, now that the field app has
   their map.
4. **Results by polling station.** The forms read and checked, the atlas's centre level,
   colour by 2022 vote, and "Do this next" from centres and wards.

Reading the forms is data work outside the app, so it can start while parts 1 to 3 are
built.

## Not in this design

- Turn-by-turn routes on the road network.
- Maps with no signal (the list works offline; the map needs a connection).
- Houses outside each campaign's map area, including the rest of Kenya for Kalonzo.
- Official station boundaries (IEBC publishes none).
- Results for races other than president 2022: the forms portal holds presidential forms
  only.
- The agent row-level security fix above.
