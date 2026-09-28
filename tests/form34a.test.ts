// Checks for filing Form 34A from a feature phone: every USSD screen, reading
// photo captions, and the USSD handler against a stand-in database.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/form34a.test.ts

import {
  ascii,
  form34aStep,
  parseFormCaption,
  reviewScreen,
  USSD_MAX,
  type Form34aCandidate,
  type Form34aStation,
} from "@/lib/form34a";
import { handleForm34aUssd, recordFormPhoto } from "@/lib/form34a.server";

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

function ok(name: string, cond: boolean, detail = "") {
  eq(detail && !cond ? `${name} (${detail})` : name, cond, true);
}

const station: Form34aStation = {
  code: "PS-0001",
  name: "Kilimani Primary",
  streams: 3,
  registered: 700,
};
const single: Form34aStation = { ...station, streams: 1 };
const ballot: Form34aCandidate[] = [
  { name: "Amani", party: "ABC" },
  { name: "Baraka", party: null },
];

const step = (s: Form34aStation, inputs: string[], b = ballot) => form34aStep(s, b, inputs);
const text = (s: ReturnType<typeof form34aStep>) => ("text" in s ? s.text : "");

// ---- walking through a stream
eq("first, which stream", step(station, []), {
  kind: "con",
  text: "PS-0001 Kilimani Primary\nMkondo (stream) upi? 1-3",
});
eq("then each candidate in ballot order", step(station, ["2"]), {
  kind: "con",
  text: "PS-0001/2 Fomu 34A (1/2)\nKura za AMANI (ABC)?",
});
eq(
  "a candidate with no party",
  text(step(station, ["2", "120"])),
  "PS-0001/2 Fomu 34A (2/2)\nKura za BARAKA?",
);
eq(
  "then rejected ballots",
  text(step(station, ["2", "120", "80"])),
  "PS-0001/2\nKura zilizokataliwa (rejected)?",
);
eq(
  "then every count to check",
  text(step(station, ["2", "120", "80", "5"])),
  "Thibitisha PS-0001/2:\nAMANI 120\nBARAKA 80\nKataliwa 5, jumla 205\n1. Tuma\n2. Futa",
);
eq("1 files it", step(station, ["2", "120", "80", "5", "1"]), {
  kind: "file",
  stream: 2,
  votes: [120, 80],
  rejected: 5,
});
eq("a one-stream station skips the question", step(single, ["120", "80", "5", "1"]), {
  kind: "file",
  stream: 1,
  votes: [120, 80],
  rejected: 5,
});

// ---- what ends a session
eq(
  "2 discards",
  text(step(station, ["2", "120", "80", "5", "2"])),
  "Haijatumwa. Piga tena kuanza upya.",
);
eq("anything else discards too", step(station, ["2", "120", "80", "5", "7"]).kind, "end");
eq(
  "a stream that does not exist",
  text(step(station, ["4"])),
  'Mkondo "4" haupo. Kituo kina mikondo 1-3. Piga tena.',
);
eq(
  "a count that is not a number",
  text(step(station, ["1", "12O"])),
  '"12O" si namba ya kura. Piga tena uanze upya.',
);
eq("six digits is a typo", step(station, ["1", "120000"]).kind, "end");
eq(
  "more votes than registered voters",
  text(step(station, ["1", "600", "100", "1"])),
  "Jumla 701 ni zaidi ya waliosajiliwa 700. Hakiki fomu, piga tena.",
);
eq(
  "no ballot yet",
  text(step(station, [], [])),
  "Orodha ya wagombea haijawekwa. Mjulishe mratibu.",
);

// ---- screens stay within what a phone shows
{
  const crowded: Form34aCandidate[] = Array.from({ length: 12 }, (_, i) => ({
    name: `Mgombea Mwenye Jina Refu Sana ${i + 1}`,
    party: "Chama Cha Wananchi Wote",
  }));
  const big = { ...station, registered: 99999 };
  const inputs = ["3", ...crowded.map(() => "7000"), "12"];
  const screens: string[] = [];
  for (let n = 0; n <= inputs.length; n++) {
    const s = form34aStep(big, crowded, inputs.slice(0, n));
    if (s.kind !== "file") screens.push(`${s.kind === "con" ? "CON" : "END"} ${s.text}`);
  }
  ok(
    "every screen fits in 182 characters",
    screens.every((s) => s.length <= USSD_MAX),
    String(Math.max(...screens.map((s) => s.length))),
  );
  ok(
    "and is plain ASCII",
    screens.every((s) => /^[\x20-\x7e\n]*$/.test(s)),
  );
  ok(
    "the review still ends with the choice",
    screens[screens.length - 1]!.endsWith("1. Tuma\n2. Futa"),
  );
}
eq(
  "a long ballot is summarised on one line",
  reviewScreen(
    "PS-0001/1",
    Array.from({ length: 9 }, (_, i) => ({ name: `Candidate${i}`, party: null })),
    Array(9).fill(1234),
    3,
  ).split("\n")[1],
  "CANDID 1234, CANDID 1234, CANDID 1234, CANDID 1234, CANDID 1234, CANDID 1234, CANDID 1234, CANDID 1234, CANDID 1234",
);
eq("accents go, apostrophes stay", ascii("Jos\u00e9 Ng\u2019ang\u2019a"), "Jose Ng'ang'a");

// ---- photo captions
eq(
  "captions agents write",
  [
    "34A PS-0001/2",
    "ps-0001 / 3",
    "Fomu mkondo 2",
    "stream 1",
    "/2",
    "PS-0001",
    "picha",
    "",
    null,
  ].map(parseFormCaption),
  [
    { code: "PS-0001", stream: 2 },
    { code: "PS-0001", stream: 3 },
    { code: null, stream: 2 },
    { code: null, stream: 1 },
    { code: null, stream: 2 },
    { code: "PS-0001", stream: null },
    { code: null, stream: null },
    { code: null, stream: null },
    { code: null, stream: null },
  ],
);

// ---- the USSD handler, against a stand-in database

type Call = { fn: string; args: Record<string, unknown> };

function fakeDb(opts: { stations: object[]; ballot: object[]; fileError?: string }) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const answer = () => {
      if (table === "polling_stations") return { data: opts.stations, error: null };
      if (table === "ballot_candidates") return { data: opts.ballot, error: null };
      if (table === "social_accounts")
        return { data: { handle: "+254 182 668723", live: true }, error: null };
      return { data: null, error: null };
    };
    const q = {
      select: () => q,
      eq: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: () => Promise.resolve(answer()),
      then: (resolve: (v: unknown) => void) => resolve(answer()),
    };
    return q;
  };
  const rpc = (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    return Promise.resolve(
      opts.fileError
        ? { data: null, error: { message: opts.fileError } }
        : { data: { corrected: false }, error: null },
    );
  };
  return { from, rpc, calls };
}

const row = {
  id: "st-1",
  code: "PS-0001",
  name: "Kilimani Primary",
  streams: 3,
  registered_voters: 700,
};

async function main() {
  {
    const db = fakeDb({ stations: [row], ballot });
    const reply = await handleForm34aUssd(db as never, "+254711000001", [
      "2",
      "120",
      "80",
      "5",
      "1",
    ]);
    eq(
      "filed, with where to send the photo",
      reply,
      "END Imepokelewa: PS-0001/2. Tuma picha ya Fomu 34A kwa WhatsApp +254182668723, andika: 34A PS-0001/2",
    );
    eq("filed with the network's number and the counts", db.calls[0]?.args, {
      _phone: "+254711000001",
      _station_id: "st-1",
      _stream: 2,
      _votes: [120, 80],
      _rejected: 5,
      _channel: "ussd",
    });
  }
  {
    const db = fakeDb({
      stations: [row],
      ballot,
      fileError: "Jumla 800 ni zaidi ya wapiga kura 700 waliosajiliwa kituo PS-0001.",
    });
    const reply = await handleForm34aUssd(db as never, "+254711000001", [
      "2",
      "120",
      "80",
      "5",
      "1",
    ]);
    ok(
      "the database's refusal reaches the agent",
      reply.startsWith("END Haijapokelewa. Jumla 800"),
      reply,
    );
  }
  {
    const db = fakeDb({ stations: [], ballot });
    eq(
      "a number that is not an agent's",
      await handleForm34aUssd(db as never, "+254799999999", []),
      "END Namba hii si ya ajenti wa kituo. Mjulishe mratibu.",
    );
    eq("and nothing is filed", db.calls.length, 0);
  }
  {
    const db = fakeDb({
      stations: [row, { ...row, id: "st-2", code: "PS-0002", name: "Lavington" }],
      ballot,
    });
    eq(
      "an agent on two stations chooses first",
      await handleForm34aUssd(db as never, "+254711000001", []),
      "CON Chagua kituo:\n1. PS-0001 Kilimani Primary\n2. PS-0002 Lavington",
    );
    await handleForm34aUssd(db as never, "+254711000001", ["2", "1", "10", "20", "0", "1"]);
    eq("then files for the one chosen", db.calls[0]?.args["_station_id"], "st-2");
  }

  // ---- a photo on WhatsApp
  {
    const calls: Call[] = [];
    const photoDb = (answer: unknown) => ({
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return Promise.resolve({ data: answer, error: null });
      },
    });
    const note = await recordFormPhoto(
      photoDb({ station: "PS-0001", stream: 2, streams: 3 }) as never,
      "+254711000001",
      { id: "wamid.1", image: { id: "media-1", caption: "34A PS-0001/2" } },
    );
    eq("the caption's station and stream go to the database", calls[0]?.args, {
      _phone: "+254711000001",
      _wa_message_id: "wamid.1",
      _wa_media_id: "media-1",
      _caption: "34A PS-0001/2",
      _code: "PS-0001",
      _stream: 2,
    });
    eq(
      "the agent is told where it went",
      note,
      "Picha ya Fomu 34A imepokelewa: PS-0001 mkondo 2. Asante.",
    );

    calls.length = 0;
    const unsure = await recordFormPhoto(
      photoDb({ station: "PS-0001", stream: null, streams: 3 }) as never,
      "+254711000001",
      { id: "wamid.2", image: { id: "media-2" } },
    );
    eq(
      "no caption: nothing said, the database matches what is waiting",
      [calls[0]?.args["_code"], calls[0]?.args["_stream"]],
      ["", 0],
    );
    ok(
      "and when it cannot tell, the agent is asked",
      unsure?.includes("mkondo haujulikani") === true,
    );

    eq(
      "someone who is not an agent gets no reply",
      await recordFormPhoto(photoDb(null) as never, "+254799999999", { id: "wamid.3", image: {} }),
      null,
    );
  }

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
