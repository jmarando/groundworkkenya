// The atlas's data files: each folder's CSVs read into rows, the checks every
// figure must pass before it becomes a migration, and the report of what is
// loaded. Pure: the scripts and the data test read the files and hand the
// text in.

import { parseCSV } from "@/lib/csv";

export const ATLAS_ELECTIONS = ["2013", "2017", "2022"].flatMap((y) =>
  ["president", "governor", "mp"].map((r) => `${y}-${r}`),
);
const LEVELS = ["country", "county", "constituency", "ward"] as const;
export type Level = (typeof LEVELS)[number];
const SEAT_LEVEL: Record<string, Level> = {
  president: "country",
  governor: "county",
  mp: "constituency",
};
const KEY_SHAPE: Record<Level, RegExp> = {
  country: /^[a-z0-9-]+$/,
  county: /^[a-z0-9-]+$/,
  constituency: /^[a-z0-9-]+\/[a-z0-9-]+$/,
  ward: /^[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/,
};
/** Kenya's counties: the national total is only checked against them once all are in. */
const COUNTIES = 47;

export type SourceRow = {
  id: string;
  title: string;
  publisher: string;
  url: string | null;
  note: string | null;
};
export type AreaRow = {
  key: string;
  level: Level;
  name: string;
  parent: string | null;
  iebc_code: string | null;
};
export type CandidateRow = {
  election: string;
  seat: string;
  name: string;
  party: string | null;
  bloc: string;
};
export type ResultRow = {
  election: string;
  seat: string;
  candidate: string;
  area: string;
  votes: number;
  source: string;
};
export type TurnoutRow = {
  election: string;
  area: string;
  registered: number | null;
  cast_votes: number | null;
  rejected: number | null;
  valid: number | null;
  source: string;
};
export type RegisterRow = { year: number; area: string; registered: number; source: string };
export type PopulationRow = {
  area: string;
  year: number;
  total: number;
  adults: number;
  young_adults: number;
  source: string;
};
export type DifferenceRow = {
  election: string;
  seat: string;
  candidate: string;
  area: string;
  difference: number;
  note: string;
};

export type AtlasFiles = {
  sources: SourceRow[];
  areas: AreaRow[];
  candidates: CandidateRow[];
  results: ResultRow[];
  turnout: TurnoutRow[];
  register: RegisterRow[];
  population: PopulationRow[];
  differences: DifferenceRow[];
};
export type TableName = keyof AtlasFiles;

export const HEADERS: Record<TableName, string[]> = {
  sources: ["id", "title", "publisher", "url", "note"],
  areas: ["key", "level", "name", "parent", "iebc_code"],
  candidates: ["election", "seat", "name", "party", "bloc"],
  results: ["election", "seat", "candidate", "area", "votes", "source"],
  turnout: ["election", "area", "registered", "cast_votes", "rejected", "valid", "source"],
  register: ["year", "area", "registered", "source"],
  population: ["area", "year", "total", "adults", "young_adults", "source"],
  differences: ["election", "seat", "candidate", "area", "difference", "note"],
};

/** The file each table is read from, inside a folder of data/atlas. */
export const FILE_NAMES: Record<TableName, string> = {
  sources: "sources.csv",
  areas: "areas.csv",
  candidates: "candidates.csv",
  results: "results.csv",
  turnout: "turnout.csv",
  register: "register.csv",
  population: "population.csv",
  differences: "known-differences.csv",
};

export const emptyFiles = (): AtlasFiles => ({
  sources: [],
  areas: [],
  candidates: [],
  results: [],
  turnout: [],
  register: [],
  population: [],
  differences: [],
});

/** Lower case, accents dropped, anything else a dash: "Ann Ng'ang'a" is "ann-ng-ang-a". */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const candidateId = (election: string, seat: string, name: string) =>
  `${election}:${seat}:${slugify(name)}`;

const WHOLE = /^(0|[1-9][0-9]*)$/;
const SIGNED = /^-?(0|[1-9][0-9]*)$/;

/** Reads one table's CSV text into `into`; returns what stopped rows being read. */
export function readTable(
  table: TableName,
  text: string,
  where: string,
  into: AtlasFiles,
): string[] {
  const problems: string[] = [];
  const [head, ...lines] = parseCSV(text).filter((r) => r.some((c) => c.trim() !== ""));
  const want = HEADERS[table];
  if (!head || head.map((h) => h.trim()).join(",") !== want.join(","))
    return [`${where}: the header must be ${want.join(",")}`];
  lines.forEach((cells, i) => {
    const at = `${where} line ${i + 2}`;
    const start = problems.length;
    const v = (name: string) => (cells[want.indexOf(name)] ?? "").trim();
    const opt = (name: string) => v(name) || null;
    const num = (name: string, required: boolean, signed = false): number | null => {
      const s = v(name);
      if (!s) {
        if (required) problems.push(`${at}: ${name} is missing`);
        return null;
      }
      if (!(signed ? SIGNED : WHOLE).test(s)) {
        problems.push(`${at}: ${name} "${s}" is not a whole number (no commas or spaces)`);
        return null;
      }
      return Number(s);
    };
    const clean = () => problems.length === start;
    switch (table) {
      case "sources":
        into.sources.push({
          id: v("id"),
          title: v("title"),
          publisher: v("publisher"),
          url: opt("url"),
          note: opt("note"),
        });
        break;
      case "areas":
        into.areas.push({
          key: v("key"),
          level: v("level") as Level,
          name: v("name"),
          parent: opt("parent"),
          iebc_code: opt("iebc_code"),
        });
        break;
      case "candidates":
        into.candidates.push({
          election: v("election"),
          seat: v("seat"),
          name: v("name"),
          party: opt("party"),
          bloc: v("bloc"),
        });
        break;
      case "results": {
        const votes = num("votes", true);
        if (clean())
          into.results.push({
            election: v("election"),
            seat: v("seat"),
            candidate: v("candidate"),
            area: v("area"),
            votes: votes ?? 0,
            source: v("source"),
          });
        break;
      }
      case "turnout": {
        const row: TurnoutRow = {
          election: v("election"),
          area: v("area"),
          registered: num("registered", false),
          cast_votes: num("cast_votes", false),
          rejected: num("rejected", false),
          valid: num("valid", false),
          source: v("source"),
        };
        if (clean()) into.turnout.push(row);
        break;
      }
      case "register": {
        const year = num("year", true);
        const registered = num("registered", true);
        if (clean())
          into.register.push({
            year: year ?? 0,
            area: v("area"),
            registered: registered ?? 0,
            source: v("source"),
          });
        break;
      }
      case "population": {
        const year = num("year", true);
        const total = num("total", true);
        const adults = num("adults", true);
        const young = num("young_adults", true);
        if (clean())
          into.population.push({
            area: v("area"),
            year: year ?? 0,
            total: total ?? 0,
            adults: adults ?? 0,
            young_adults: young ?? 0,
            source: v("source"),
          });
        break;
      }
      case "differences": {
        const difference = num("difference", true, true);
        if (clean())
          into.differences.push({
            election: v("election"),
            seat: v("seat"),
            candidate: v("candidate"),
            area: v("area"),
            difference: difference ?? 0,
            note: v("note"),
          });
        break;
      }
    }
  });
  return problems;
}

/** Every problem with the figures, one sentence each; none means they can become a migration. */
export function checkAtlas(f: AtlasFiles, wardSlugs: Record<string, string[]>): string[] {
  const out: string[] = [];
  // Differences IEBC's own documents carry, keyed as election|seat|candidate|area
  // (seat and candidate empty for a turnout row's valid + rejected against cast).
  const known = new Map(
    f.differences.map((d) => [`${d.election}|${d.seat}|${d.candidate}|${d.area}`, d.difference]),
  );
  const allowed = (key: string, diff: number) => diff === 0 || known.get(key) === diff;

  const sources = new Set<string>();
  for (const s of f.sources) {
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(s.id))
      out.push(`sources: "${s.id}" must be lower-case letters, digits and dashes`);
    if (sources.has(s.id)) out.push(`sources: "${s.id}" is listed twice`);
    if (!s.title || !s.publisher) out.push(`sources: "${s.id}" needs a title and a publisher`);
    if (s.url && !/^https?:\/\//.test(s.url))
      out.push(`sources: "${s.id}" has a url that doesn't start with http`);
    sources.add(s.id);
  }
  const source = (where: string, id: string) => {
    if (!sources.has(id)) out.push(`${where}: source "${id}" isn't listed`);
  };

  const areas = new Map<string, AreaRow>();
  for (const a of f.areas) {
    if (areas.has(a.key)) out.push(`areas: "${a.key}" is listed twice`);
    areas.set(a.key, a);
  }
  for (const a of f.areas) {
    if (!(LEVELS as readonly string[]).includes(a.level)) {
      out.push(`areas: "${a.key}" has an unknown level "${a.level}"`);
      continue;
    }
    if (!KEY_SHAPE[a.level].test(a.key))
      out.push(`areas: "${a.key}" isn't shaped like a ${a.level} key`);
    if (!a.name) out.push(`areas: "${a.key}" needs a name`);
    if (a.iebc_code && !/^[0-9]{1,6}$/.test(a.iebc_code))
      out.push(`areas: "${a.key}" has an IEBC code that isn't digits`);
    const parent =
      a.level === "country"
        ? null
        : a.level === "county"
          ? "kenya"
          : a.key.split("/").slice(0, -1).join("/");
    if (a.parent !== parent) out.push(`areas: "${a.key}" should have the parent "${parent ?? ""}"`);
    else if (parent && !areas.has(parent))
      out.push(`areas: "${a.key}"'s parent "${parent}" isn't listed`);
    if (a.level === "ward") {
      const [county = "", , slug = ""] = a.key.split("/");
      const map = wardSlugs[county];
      if (!map)
        out.push(`areas: there's no ward map for ${county}, so "${a.key}" can't be checked`);
      else if (!map.includes(slug))
        out.push(`areas: the ward "${slug}" isn't in ${county}'s ward map`);
    }
  }
  const area = (where: string, key: string) => {
    if (areas.has(key)) return true;
    out.push(`${where}: the area "${key}" isn't listed`);
    return false;
  };

  const candidates = new Map<string, CandidateRow>();
  for (const c of f.candidates) {
    const where = `candidates: ${c.name || "(no name)"} in ${c.election}`;
    if (!ATLAS_ELECTIONS.includes(c.election)) {
      out.push(`${where}: unknown election`);
      continue;
    }
    const race = c.election.slice(5);
    const seat = areas.get(c.seat);
    if (!seat) out.push(`${where}: the seat "${c.seat}" isn't listed`);
    else if (seat.level !== SEAT_LEVEL[race])
      out.push(`${where}: a ${race} seat must be a ${SEAT_LEVEL[race]}, not "${c.seat}"`);
    if (!c.name) out.push(`${where}: needs a name`);
    if (!c.bloc) out.push(`${where}: needs a bloc`);
    else if (/^independent$/i.test(c.bloc))
      out.push(`${where}: name the independent's bloc, as "Independent: ${c.name}"`);
    const id = candidateId(c.election, c.seat, c.name);
    if (candidates.has(id)) out.push(`${where}: listed twice for ${c.seat}`);
    candidates.set(id, c);
  }

  const votesAt = new Map<string, number>();
  const sumAt = new Map<string, number>();
  for (const r of f.results) {
    const where = `results: ${r.election} ${r.candidate} in ${r.area}`;
    const id = candidateId(r.election, r.seat, r.candidate);
    if (!candidates.has(id)) out.push(`${where}: no such candidate for ${r.seat}`);
    if (
      area(where, r.area) &&
      !(r.seat === "kenya" || r.area === r.seat || r.area.startsWith(`${r.seat}/`))
    )
      out.push(`${where}: the area is outside the seat "${r.seat}"`);
    source(where, r.source);
    const k = `${id}|${r.area}`;
    if (votesAt.has(k)) out.push(`${where}: listed twice`);
    votesAt.set(k, r.votes);
    const at = `${r.election}|${r.area}`;
    sumAt.set(at, (sumAt.get(at) ?? 0) + r.votes);
  }

  const turnoutAt = new Map<string, TurnoutRow>();
  for (const t of f.turnout) {
    const where = `turnout: ${t.election} in ${t.area}`;
    if (!ATLAS_ELECTIONS.includes(t.election)) out.push(`${where}: unknown election`);
    area(where, t.area);
    source(where, t.source);
    const k = `${t.election}|${t.area}`;
    if (turnoutAt.has(k)) out.push(`${where}: listed twice`);
    turnoutAt.set(k, t);
    if (t.cast_votes !== null && t.registered !== null && t.cast_votes > t.registered)
      out.push(`${where}: more votes cast (${t.cast_votes}) than registered (${t.registered})`);
    if (t.valid !== null && t.cast_votes !== null && t.valid > t.cast_votes)
      out.push(`${where}: more valid votes (${t.valid}) than cast (${t.cast_votes})`);
    if (
      t.valid !== null &&
      t.rejected !== null &&
      t.cast_votes !== null &&
      !allowed(`${t.election}|||${t.area}`, t.cast_votes - t.valid - t.rejected)
    )
      out.push(
        `${where}: valid (${t.valid}) and rejected (${t.rejected}) don't make cast (${t.cast_votes})`,
      );
  }
  for (const [k, total] of sumAt) {
    const t = turnoutAt.get(k);
    const cap = t ? (t.valid ?? t.cast_votes) : null;
    if (cap !== null && total > cap) {
      const [election, at] = k.split("|");
      const what = t?.valid !== null ? "valid votes" : "votes cast";
      out.push(
        `results: ${election} in ${at}: the candidates' votes (${total}) are more than the ${what} (${cap})`,
      );
    }
  }

  // Each total against its parts, once every part is in.
  const children = new Map<string, string[]>();
  for (const a of f.areas)
    if (a.parent) children.set(a.parent, [...(children.get(a.parent) ?? []), a.key]);
  for (const r of f.results) {
    const kids = children.get(r.area) ?? [];
    if (areas.get(r.area)?.level === "country" && kids.length < COUNTIES) continue;
    const id = candidateId(r.election, r.seat, r.candidate);
    const parts = kids.map((k) => votesAt.get(`${id}|${k}`));
    if (!kids.length || parts.some((p) => p === undefined)) continue;
    const sum = parts.reduce((t: number, p) => t + (p ?? 0), 0);
    if (!allowed(`${r.election}|${r.seat}|${r.candidate}|${r.area}`, r.votes - sum))
      out.push(
        `results: ${r.election} ${r.candidate}: ${r.area} has ${r.votes} but its ${kids.length} parts add up to ${sum}`,
      );
  }

  const seen = new Set<string>();
  for (const r of f.register) {
    const where = `register: ${r.year} in ${r.area}`;
    if (![2013, 2017, 2022].includes(r.year))
      out.push(`${where}: the year must be 2013, 2017 or 2022`);
    area(where, r.area);
    source(where, r.source);
    if (seen.has(`register|${r.year}|${r.area}`)) out.push(`${where}: listed twice`);
    seen.add(`register|${r.year}|${r.area}`);
  }
  for (const p of f.population) {
    const where = `population: ${p.area} in ${p.year}`;
    area(where, p.area);
    source(where, p.source);
    if (p.adults > p.total || p.young_adults > p.adults)
      out.push(`${where}: adults must be within the total, and 18–34 within the adults`);
    if (seen.has(`population|${p.year}|${p.area}`)) out.push(`${where}: listed twice`);
    seen.add(`population|${p.year}|${p.area}`);
  }
  return out;
}

/** What is loaded for each county, what is missing, and every source, as Markdown. */
export function atlasReport(f: AtlasFiles): string {
  const name = new Map(f.areas.map((a) => [a.key, a.name]));
  const counties = f.areas
    .filter((a) => a.level === "county")
    .map((a) => a.key)
    .sort();
  const lines = [
    "# Election atlas: what's loaded",
    "",
    "Written by scripts/atlas/report.ts from data/atlas. Each figure's document is listed under Sources; whatever a county lists as missing was not found.",
    "",
  ];
  for (const county of counties) {
    const consts = f.areas.filter((a) => a.parent === county).map((a) => a.key);
    const wards = f.areas
      .filter((a) => a.level === "ward" && a.key.startsWith(`${county}/`))
      .map((a) => a.key);
    const missing: string[] = [];
    lines.push(
      `## ${name.get(county) ?? county}`,
      "",
      "| Election | Constituencies with results | Turnout | County total |",
      "|---|---|---|---|",
    );
    for (const e of ATLAS_ELECTIONS) {
      const label = e.replace("-", " ");
      const withResults = consts.filter((c) =>
        f.results.some((r) => r.election === e && r.area === c),
      ).length;
      const withTurnout = consts.filter((c) =>
        f.turnout.some((t) => t.election === e && t.area === c),
      ).length;
      const countyTotal = e.endsWith("-mp")
        ? "n/a"
        : f.results.some((r) => r.election === e && r.area === county)
          ? "yes"
          : "no";
      lines.push(
        `| ${label} | ${withResults} of ${consts.length} | ${withTurnout} of ${consts.length} | ${countyTotal} |`,
      );
      if (withResults < consts.length)
        missing.push(
          `${label}: results for ${consts.length - withResults} of ${consts.length} constituencies`,
        );
      if (countyTotal === "no") missing.push(`${label}: the county total`);
    }
    const reg = [2013, 2017, 2022].map(
      (y) =>
        `${y}: ${wards.filter((w) => f.register.some((r) => r.year === y && r.area === w)).length} of ${wards.length}`,
    );
    const pop = wards.filter((w) => f.population.some((p) => p.area === w)).length;
    lines.push(
      "",
      `Registered voters by ward: ${reg.join(" · ")}.`,
      `Population estimates: ${pop} of ${wards.length} wards.`,
      "",
    );
    if (missing.length) lines.push("Missing:", ...missing.map((m) => `- ${m}`), "");
  }
  lines.push(
    "## Sources",
    "",
    ...[...f.sources]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(
        (s) =>
          `- \`${s.id}\`: ${s.title}, ${s.publisher}${s.url ? `, ${s.url}` : ""}${s.note ? `. ${s.note}` : ""}`,
      ),
    "",
  );
  return lines.join("\n");
}
