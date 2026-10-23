// The diary as an iCalendar file (RFC 5545) that Google Calendar, Apple Calendar and Outlook
// subscribe to. Pure. The feed is /api/public/calendar/<token>.ics; the link is made on the Diary.

export type FeedEntry = {
  id: string;
  day: string;
  startsAt: string | null;
  title: string;
  kind: string | null;
  note: string | null;
  wardName: string | null;
  updatedAt: string | null;
};

/** How long an entry with a start time runs, when the diary gives no end. */
const MINUTES = 60;

/** Text as iCalendar wants it: backslash, semicolon, comma and newline escaped. */
export const icsText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 octets folded, as the standard requires. */
export function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 75;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

const compactDay = (day: string) => day.replace(/-/g, "");
/** "2026-10-21" and "09:30:00" as a local Nairobi time, 20261021T093000. */
const local = (day: string, time: string) =>
  `${compactDay(day)}T${time.slice(0, 5).replace(":", "")}00`;
const stamp = (iso: string | null) =>
  (iso ? new Date(iso) : new Date())
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

function addMinutes(day: string, time: string, minutes: number): { day: string; time: string } {
  const t = new Date(`${day}T${time.slice(0, 5)}:00Z`);
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return { day: t.toISOString().slice(0, 10), time: t.toISOString().slice(11, 16) };
}

const nextDay = (day: string) => {
  const t = new Date(`${day}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
};

/** The whole calendar: Nairobi's time zone (no daylight saving), then one event per entry. */
export function diaryCalendar(campaign: string, entries: FeedEntry[], now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Groundwork//Diary//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(`${campaign} · diary`)}`,
    "X-WR-TIMEZONE:Africa/Nairobi",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    "BEGIN:VTIMEZONE",
    "TZID:Africa/Nairobi",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0300",
    "TZOFFSETTO:+0300",
    "TZNAME:EAT",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  for (const e of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.day)) continue;
    const description = [
      e.kind ? `Kind: ${e.kind}` : null,
      e.wardName ? `Ward: ${e.wardName}` : null,
      e.note,
    ]
      .filter(Boolean)
      .join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@groundwork.ke`,
      `DTSTAMP:${stamp(e.updatedAt ?? now.toISOString())}`,
    );
    if (e.startsAt && /^\d{2}:\d{2}/.test(e.startsAt)) {
      const end = addMinutes(e.day, e.startsAt, MINUTES);
      lines.push(
        `DTSTART;TZID=Africa/Nairobi:${local(e.day, e.startsAt)}`,
        `DTEND;TZID=Africa/Nairobi:${local(end.day, end.time)}`,
      );
    } else {
      lines.push(
        `DTSTART;VALUE=DATE:${compactDay(e.day)}`,
        `DTEND;VALUE=DATE:${compactDay(nextDay(e.day))}`,
      );
    }
    lines.push(`SUMMARY:${icsText(e.title || "Diary")}`);
    if (e.wardName) lines.push(`LOCATION:${icsText(e.wardName)}`);
    if (description) lines.push(`DESCRIPTION:${icsText(description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** The links a person pastes or taps: the https feed, Apple's webcal and Google's add-by-URL. */
export function feedLinks(origin: string, token: string) {
  const https = `${origin.replace(/\/+$/, "")}/api/public/calendar/${token}.ics`;
  const webcal = https.replace(/^https?:\/\//, "webcal://");
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
  };
}
