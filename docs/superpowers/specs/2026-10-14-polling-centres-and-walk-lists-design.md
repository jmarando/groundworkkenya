# Polling centres and walk lists

Status: designed with the user and approved on 14 October 2026, section by section. This is
parts 2 and 3 of `2026-10-12-voters-map-design.md`, with the details settled; where the two
differ, this one holds. Decisions:

- **Centres from IEBC's public data:** the 2022 register for the list, OpenStreetMap school
  names for positions, organisers' pins and agents' "I'm here" for the rest.
- **Agents see full phone numbers.** People records stay readable by the whole team as
  today; agents keep today's ward lists beside their walk lists.
- **"Not home" counts toward a list,** and the house comes back into suggested patches
  after 3 days; a house spoken to or refused stays out for 30 days.
- **A list carries its houses:** each door is saved with its plus code, position, outline
  and ward, so the phone never reads the house file for a list.

## Why

The Voters map (part 1) goes down to every house but stops there. Sakaja's 85 polling
stations are samples with no position, Mathira and Kalonzo have none, and a "walk list" is
still a ward's people or a street name with a typed-in agent. Organisers need to see the
real centres, cut the houses around them into lists, and give each list to someone whose
phone works through it door by door, with or without signal.

## The register

`https://www.iebc.or.ke/docs/rov_per_polling_station.pdf` ("Registered voters per polling
stations for the 2022 General Election"): 712 pages exported from Excel on 3 August 2022,
45.5 MB, with a text layer. One row per stream: county, constituency, ward (CAW), centre
code and name, the 15-digit stream code (county 3, constituency 3, ward 4, centre 3, stream
2; a centre's IEBC code is the first 13), the stream's name and its registered voters.

Checked on 14 October 2026:

- Nairobi (county 047): 376 centres, 3,636 streams, 85 wards. 30 rows wrap onto a second
  line, so the reader finds rows by their 15-digit codes and takes the count from the next
  line when it isn't on the code's. With those rows, the total is the atlas's 2,415,310.
- Mathira (county 019, constituency 096): 109 centres, 201 streams, 6 wards, 104,492
  registered, as in the atlas.

The PDF isn't committed; the script reads it from a path it's given.

## 1. Polling centres

- **The list.** A script in `scripts/stations/` reads the register into
  `data/stations/nairobi.csv` and `data/stations/mathira.csv`: one row per centre, with its
  13-digit IEBC code, name, ward, streams and registered voters. It stops when a ward's
  streams don't add up to the atlas's registered voters (`data/atlas/<county>/register.csv`)
  or an IEBC ward name doesn't match one of ours (a short list of known spellings, as
  `scripts/geo/nairobi_wards.py` keeps).
- **Positions.** The same script fetches OpenStreetMap's schools, colleges and
  universities in Nairobi and Nyeri and gives a centre a school's position when their names
  match without words like "primary school", the school is inside the centre's ward or
  within 2 km of it, and they aren't one primary and one secondary. A close name (one word
  off) is kept as a hollow pin until someone confirms it. Positions are written beside the
  centres in `data/stations/`, whose README credits OpenStreetMap (ODbL) and IEBC.
- **Stored per campaign** in `polling_stations`:
  - Sakaja and Kalonzo get Nairobi's 376 centres, Mathira its 109.
  - `code` stays the short code agents key on USSD and write on a form's photo: PS-0001
    upwards in IEBC's order. A new `iebc_code` holds the 13 digits.
  - Sakaja's 85 sample rows go, except a row with a filed result, a form photo or an agent
    other than the seeded "Agent <ward>": those are kept with their code changed to
    SAMPLE-0001 onwards, for the team to sort out. The war room, the agents page and Form
    34A filing keep working on the same table.
- **On the map, at ward level (zoom 13 to 16).**
  - Centres are drawn as circles sized by registered voters; a close-name one is hollow; a
    centre with no position isn't drawn.
  - The part of the ward nearest each placed centre is shaded: a Voronoi cell of the
    centres, cut to the ward's shape, worked out in the browser (`d3-delaunay`,
    `polygon-clipping`). The legend calls it "nearest centre": IEBC publishes no station
    boundaries. Houses take their centre by the same rule.
  - The hint reads "Click a centre to open it". Search finds centres by name.
- **The ward's panel** lists its centres: name, streams, registered voters, and houses
  knocked in 30 days in its area. Centres with no position are listed under "Not on the map
  yet", each with **Place it**.
- **A centre's card:** its streams and registered voters, the houses in its area and how
  many were knocked in 30 days, supporters found there, its walk lists, where its position
  came from (OpenStreetMap, a close name, an organiser or an agent, with who and when), any
  agent's suggestion waiting, and **Plan a walk list here**. 2022 results come with part 4.
- **The address** gains the chosen centre, so a link or a reload opens it.
- **Place it:** an organiser drops a pin at the middle of the ward and drags it where the
  centre is; saving records the organiser and the time.
- **I'm here,** in the field app under **Polling centres near me** (the centres within 2 km,
  nearest first; it needs signal): the phone's position becomes the centre's when it is
  no more than 300 m outside the box around the centre's ward, and accurate to 50 m.
  Otherwise it is kept as a suggestion, and an organiser can use it from the centre's
  card. It also confirms a close-name position.

## 2. Planning walk lists (on the map)

- **Two ways to start,** from a centre's card (**Plan a walk list here**) or at street level
  (zoom 16 to 20):
  - **Use the suggested patch:** the 50 houses nearest the centre, or nearest a point the
    organiser taps, in that centre's area. It skips houses spoken to or refused in 30 days,
    houses marked not home in the last 3 days, and houses on another open list. In a ward
    with no placed centre, the patch is the 50 nearest the tapped point in that ward.
  - **Draw around houses:** tap points to draw a shape; every house whose centre is inside
    goes on the list, except houses on another open list, which the screen counts ("12
    houses are on other lists and were left out"). Over 150 houses, it asks for a smaller
    area.
- **The draft.** The doors are numbered in walking order on the map: starting at the door
  nearest the centre (or the first door), a nearest-neighbour walk, then shortened by
  reversing stretches while that helps (2-opt), on straight-line distances between house
  centres. Tapping a house takes it off the draft or adds it, and the order is worked out
  again.
- **Giving it out.** The organiser names the list (by default the centre's name and a
  number, "Kileleshwa Primary 3"; the ward's name with no centre), picks someone (agents
  first, each with the doors still open on their lists; anyone in the campaign's team can
  be picked) and presses **Send**.
- **A list is a draft, out (with one person) or done.** It is done when every door has a
  visit since the list first went out, "not home" included, or when an organiser closes it.
  An out list can be given to someone else and keeps its progress.
- **On the map,** open lists are outlined at street level; a chosen list's doors are
  numbered and coloured by their latest visit as visits come in. The address gains the
  chosen list.
- **The panel.** A list's card: who has it and since when, "15 of 44 done" with a bar, how
  many doors were not home, **Give to someone else** and **Close**. An area's panel adds
  walk lists out, doors this week and agents out today.
- **Who:** the candidate, managers and organisers plan, send, give again and close lists.

## 3. The agent's phone

- **The field app opens on Your walk lists:** the lists out with this person, each with its
  centre, "15 of 44 done" and when it was given. Below them: today's ward list and **Add
  someone you meet** (unchanged), and **Polling centres near me**. The lists refresh when
  the app opens and every minute while it is open with signal; notifications are the next
  piece.
- **A list, opened:**
  - **A header:** its name, "15 of 44 done" and a bar; with no signal, "No signal · 3 visits
    saved on the phone, they send when it comes back". Visits waiting to send count toward
    the progress.
  - **The map of its doors,** numbered in walking order and coloured by outcome, the next
    door ringed and the phone's position shown. With signal it sits on the street map; with
    none it is drawn from the list's own house outlines on a plain background.
  - **This door:** its number, who is on file there with their numbers, and the last visit;
    then **Spoke**, **Not home** or **Refused**. Spoke opens support 1 to 5, the issue and
    **Add them** (name, phone and the consent ticks, as today). **Save · go to door 16**
    saves and moves to the next door without a visit. A door can be skipped and come back
    to.
- **Visits.** A visit at a list's door is recorded at that house and with that list: the
  agent doesn't pick the house. A door where no one gives a name (not home, refused, or
  spoke without giving one) is recorded on the house alone. Visits join today's queue on
  the phone (`lib/field.ts`), which sends them once there is signal and never twice.
- **With no signal,** a list opened once with signal is kept on the phone: its doors, order,
  outlines, the names and numbers on file there and their last visits. This changes the
  offline app's rule that no names or numbers are kept on a phone, for walk lists only,
  with the user's agreement on 14 October 2026. A list's copy is deleted when the list is
  done or closed, at sign-out, and after 14 days.
- **Street plans go:** the street-plan screen and the field app's list of streets are
  removed; `canvass_streets` and its rows are left as they are.
- **Agents leave `/voters`** (`canOpen()` in `lib/access.ts`), now that the field app has
  their map: they keep the field app and Foundations.

## 4. Data and access

Both migrations come after schema 26 (`20261014100000_voters_map_last_score.sql`), which
must be applied first.

- **Schema 27, centres:**
  - `polling_stations` gains `iebc_code`, `lat`, `lng`, `placed_by` (`osm`, `osm-close`,
    `organiser`, `agent`), `placed_accuracy_m`, `placed_at`, `placed_actor`, and one
    agent's suggestion waiting (`suggested_lat`, `suggested_lng`,
    `suggested_accuracy_m`, `suggested_at`, `suggested_by`).
  - `wards` gains the box around its outline (`west`, `south`, `east`, `north`) from the
    ward file, which the 300 m check uses.
  - `place_station` (candidate, managers and organisers) and `station_here` (anyone in the
    team: checks the campaign, the distance and the accuracy, records who and when, and
    keeps a suggestion when a check fails).
  - The centres for each campaign from `data/stations/`, and the sample rows' swap.
- **Schema 28, walk lists:**
  - `walk_lists`: name, centre, ward, status (`draft`, `out`, `done`), given to (a user),
    first sent at, given at, made by, done at and closed by.
  - `walk_list_doors`: the list, its place in the walking order, the plus code, the
    house's centre point, its outline (the rings, rounded to about a metre) and its ward.
  - `house_visits` gains `walk_list_id`.
  - `record_door` takes the list, and a visit at a house with no person.
  - A house can't be on two open lists: saving a list leaves off any house already on
    another open list (two organisers planning the same street at once), and the screen
    says how many were left off.
  - A list becomes done by itself when every door has a visit since it first went out.
- **Access,** by AGENTS.md's campaign rules (`campaign_id`, "own campaign only"):
  - The candidate, managers and organisers read and write lists and their doors.
  - An agent reads the lists given to them, their doors, and the visits at those doors,
    besides their own visits.
  - People records are unchanged.
- **On the phone,** the offline app's saved data (`src/lib/offline/saved.ts`) gains two
  entries: the person's walk lists, and each list's doors with the names and numbers on file
  there. Today's ward lists are still never saved.
- **New libraries:** `d3-delaunay` and `polygon-clipping`.

## Testing

As the repository does it: `tests/*.test.ts` scripts with `eq()`, run by `npm test`, then
the SQL tests (`tests/sql/run.sh`).

- **The register reader:** rows found by their 15 digits, wrapped rows included; Nairobi
  376 centres and 3,636 streams adding up to 2,415,310; Mathira 109, 201 and 104,492; an
  unknown ward name stops it.
- **Name matching:** "primary school"-style words ignored; inside the ward or within 2 km;
  never a primary with a secondary; a close name marked hollow.
- **Nearest-centre areas:** every house in exactly one area, every area inside its ward.
- **Lists:** the patch takes the nearest 50 and skips spoken to or refused in 30 days, not
  home in 3 days and other open lists; drawing takes the houses inside and refuses over 150;
  the walking order of a known short walk, and 2-opt never lengthening it.
- **The database:** Place it for organisers only; I'm here moves a pin within 300 m and 50
  m and otherwise keeps a suggestion; another campaign's centres are never touched; an
  agent reads only their own lists, doors and visits; a house can't be on two open lists;
  `record_door` with a list, with no person, and a repeat ignored; a list turning done; the
  sample swap keeping a row with a filed result.
- **On the phone:** the two saved entries kept, and deleted at done, sign-out and 14 days;
  ward lists never saved.
- **The preview harness:** centres at ward level, a centre's card, Place it, a patch and a
  drawn list, a list's card; on the phone, Your walk lists and a list with no signal on the
  plain map.
- **By the user, after release:** a list end to end on a phone in airplane mode, and I'm
  here at a real centre.

## Build order

Two parts, each with its own plan and release.

1. **Centres:** the register script and its files, schema 27, the ward level, the centre's
   card and Place it on the map, then I'm here in the field app.
2. **Walk lists:** schema 28, planning and sending on the map, Your walk lists and a list's
   doors on the phone, keeping a list for no signal, street plans retired, agents out of
   `/voters`.

## Not in this design

- 2022 results by polling station (part 4: reading IEBC's Forms 34B).
- Routes along roads.
- Street maps with no signal: only a list's own houses are kept.
- Notifications (the next piece, starting with "You've been given a walk list").
- Houses outside a campaign's map area.
- Agents' write access to people records, which is still open and worth its own fix.
