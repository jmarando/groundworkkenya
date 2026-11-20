# The diary as a calendar

The Diary showed a week as seven cards that wrapped three to a row, so days landed wherever the
cards fell and a busy day stretched its row. A rule meant for the time rows (`.mb-time li`) also
reached the list inside each entry, squeezing "Municipality: 0 supporters found…" into a column a
word wide. On 20 November 2026 the user asked for a calendar that works like Google Calendar, and
for the crowd suggestions to be tested in it. Decided: build it on FullCalendar.

## What the team sees

- **A toolbar**: Today, back and forward, the range as the page title ("16 – 22 Nov 2026"), a
  switch between Day, Week, Month and Schedule, and Add for those who plan the diary. Archive stays
  beside the title.
- **Week** (the default on a computer): Monday to Sunday side by side, hours down the side in
  24-hour time, entries without a time in an "All day" row, today shaded, a line at the time now.
  **Day** is the same for one day. **Month** shows each day's entries as short bars, with "+2
  more" when a day is full. **Schedule** (the default on a phone) lists the week by day.
- **Click an entry** to open its panel: kind and ward, title, day and time, the note, the line
  from the last election in that ward, the ward's message and field findings for stops in the next
  seven days, then Edit and Remove. The notes no longer crowd the grid.
- **Click an empty time** to add an entry there; Add in the toolbar adds one for today. The form
  has the day, the time (blank for all day), the kind, the title, the ward and the note.
- **Drag an entry** to another time or day to move it. Dropping it in the "All day" row clears its
  time. Only those who can change the diary can drag, click to add, edit or remove.
- **Crowd suggestions on the grid**: each event from "Where the crowds are" that nobody has decided
  on shows as a dashed block on its day ("Suggested"). Its panel gives the place, what the notice
  says about the crowd, the link to the source, "Add to the diary" and "Not for us". Adding opens
  the new entry's panel, and the block turns into a solid entry; setting it aside removes it. The
  list under the calendar stays, for the next three weeks at a glance.
- A finding's "Plan a visit" (`/diary?add=<ward>`) opens the add form for today with that ward
  chosen, as before. `?week=YYYY-MM-DD` still opens the calendar on that day.

## How it works

- `src/lib/diary-calendar.ts` (pure, tested in `tests/diary-calendar.test.ts`) turns entries and
  crowd events into calendar events. The diary keeps only a start time, so a block runs for its
  kind's usual length (meeting or media 1 hour, visit 1.5, market, church or rally 2, funeral 3,
  a crowd event 2) and ends early when the next entry that day starts, never under 30 minutes.
  It also gives the hours to show (06:00 to 21:00, wider when an entry falls outside), what a drop
  means (`dropTarget`) and the range to read (`cleanRange`: at most 42 days).
- Times are Nairobi's wall clock. The calendar runs in UTC with times written without a zone, so
  10:00 shows as 10:00 wherever the viewer is, and "today" and the line for now come from Nairobi's
  clock (`nairobiNow`), not the viewer's.
- `getDiaryRange` reads the entries for the dates on screen (a week, a day, or the six weeks of a
  month view) with the campaign's wards. Saving, moving and removing use the same server functions
  as before, so the database's rules are unchanged. No migration.
- FullCalendar's MIT plugins only: `@fullcalendar/core`, `react`, `daygrid`, `timegrid`, `list`,
  `interaction` (6.1.22, React 19). The signed-in pages are rendered in the browser only, so the
  calendar never runs on the server. Its colours, borders and type come from Groundwork's tokens.
- The panel is the app's sheet (Radix dialog): from the right on a computer, from the bottom on a
  phone; Escape and the close button shut it and focus returns to where it was.

## Limits

- Lengths are assumed. If the team wants real end times, that needs an `ends_at` column.
- Dragging on a phone needs a long press (FullCalendar's touch delay); the form's day and time
  fields do the same job.
