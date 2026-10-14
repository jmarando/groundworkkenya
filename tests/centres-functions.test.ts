// Checks for the polling centres' server side (src/lib/centres.functions.ts): the read, which
// fails soft before schema 27 and says why in the server log, and the three calls that place a
// centre. Against a stand-in database; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/centres-functions.test.ts

import {
  adoptSuggestion,
  cleanHere,
  cleanPin,
  placeStation,
  readCentres,
  stationHere,
} from "@/lib/centres.functions";
import type { Client } from "@/lib/houses.functions";

import { fakeSupabase } from "./fake-supabase";

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

/** Runs a read with console.error caught: its answer, and the first argument of each call. */
async function logged<T>(read: () => Promise<T>): Promise<[T, unknown[]]> {
  const lines: unknown[] = [];
  const original = console.error;
  console.error = (first?: unknown) => {
    lines.push(first);
  };
  try {
    return [await read(), lines];
  } finally {
    console.error = original;
  }
}

/** The message of whatever a call throws, or null if it doesn't. */
async function thrown(call: () => unknown): Promise<string | null> {
  try {
    await call();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const station = (code: string, extra: Record<string, unknown> = {}) => ({
  id: `id-${code}`,
  code,
  iebc_code: null,
  name: `CENTRE ${code}`,
  ward_id: "w-1",
  registered_voters: 1000,
  streams: 3,
  lat: null,
  lng: null,
  placed_by: null,
  placed_accuracy_m: null,
  placed_at: null,
  placed_actor: null,
  suggested_lat: null,
  suggested_lng: null,
  suggested_accuracy_m: null,
  suggested_at: null,
  suggested_by: null,
  ...extra,
});

{
  // Rows out of order, one placed by a person with a name on file, one by someone whose name is blank.
  const sb = fakeSupabase({
    polling_stations: [
      station("PS-0003", { lat: -1.3, lng: 36.8, placed_by: "organiser", placed_actor: "u-9" }),
      station("PS-0001"),
      station("PS-0002", { lat: -1.2, lng: 36.7, placed_by: "organiser", placed_actor: "u-1" }),
    ],
    profiles: [
      { user_id: "u-1", full_name: "Njoki Mwangi" },
      { user_id: "u-9", full_name: "  " },
    ],
  });
  eq(
    "centres in code order, with who placed each by name when there is one",
    (await readCentres(sb))?.map((c) => [c.code, c.placed?.who ?? null]),
    [
      ["PS-0001", null],
      ["PS-0002", "Njoki Mwangi"],
      ["PS-0003", null],
    ],
  );
}

eq(
  "every centre, paged past 1,000 rows",
  (
    await readCentres(
      fakeSupabase({
        polling_stations: Array.from({ length: 2300 }, (_, i) =>
          station(`PS-${String(i + 1).padStart(4, "0")}`),
        ),
      }),
    )
  )?.length,
  2300,
);

{
  // Before schema 27 the table has no position columns, and a read that asks for them is refused.
  const fault = (message: string) => ({ data: null, error: { message } });
  const answers = (answer: unknown) => {
    const q: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order", "range"]) q[method] = () => q;
    q["then"] = (resolve: (a: unknown) => unknown) => Promise.resolve(answer).then(resolve);
    return q;
  };
  const refused: Client = {
    from: () => answers(fault("column polling_stations.lat does not exist")),
    rpc: () => answers(fault("unused")),
  };
  const [centres, log] = await logged(() => readCentres(refused));
  eq("centres that can't be read are null, not none", centres, null);
  eq("and the log says why, once, with no rows in it", log, [
    "Could not read the polling centres: column polling_stations.lat does not exist",
  ]);

  // The names are a nicety: a refused lookup of them leaves the centres as they are.
  const real = fakeSupabase({
    polling_stations: [
      station("PS-0001", { lat: -1.2, lng: 36.7, placed_by: "organiser", placed_actor: "u-1" }),
    ],
  });
  const noNames: Client = {
    from: (table) =>
      table === "profiles" ? answers(fault("permission denied")) : real.from(table),
    rpc: real.rpc,
  };
  const [kept] = await logged(() => readCentres(noNames));
  eq(
    "a refused lookup of names keeps the centres, with no name",
    kept?.map((c) => [c.code, c.placed?.by, c.placed?.who]),
    [["PS-0001", "organiser", null]],
  );
}

// What a pin must be before it goes to the database.
const ID = "8f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b";
eq("a good pin is kept as it is", cleanPin({ id: ID, lat: -1.28, lng: 36.78 }), {
  id: ID,
  lat: -1.28,
  lng: 36.78,
});
for (const [why, input] of [
  ["no centre", { lat: -1.28, lng: 36.78 }],
  ["a centre that isn't an id", { id: "PS-0001", lat: -1.28, lng: 36.78 }],
  ["nothing at all", null],
] as [string, unknown][])
  eq(`${why} is told to pick one`, await thrown(() => cleanPin(input)), "Pick a centre.");
for (const [why, input] of [
  ["a latitude past the pole", { id: ID, lat: 95, lng: 36.78 }],
  ["a longitude past the date line", { id: ID, lat: -1.28, lng: -181 }],
  ["text for a latitude", { id: ID, lat: "-1.28", lng: 36.78 }],
  ["not a number", { id: ID, lat: Number.NaN, lng: 36.78 }],
] as [string, unknown][])
  eq(`${why} is no place`, await thrown(() => cleanPin(input)), "That isn't a place on the map.");

eq(
  "a position from a phone, with how accurate it said it was",
  cleanHere({ id: ID, lat: -1.28, lng: 36.78, accuracyM: 12.5 }),
  { id: ID, lat: -1.28, lng: 36.78, accuracyM: 12.5 },
);
eq(
  "a phone that gave no accuracy sends none, and the database decides",
  cleanHere({ id: ID, lat: -1.28, lng: 36.78, accuracyM: Number.NaN }).accuracyM,
  null,
);

// What the database functions are called with: their argument names are the contract.
{
  const calls: [string, unknown][] = [];
  const answer = (fn: string) => (fn === "station_here" ? { moved: true } : null);
  const spy: Client = {
    from: () => {
      throw new Error("unused");
    },
    rpc: (fn, args) => {
      calls.push([fn, args]);
      return Promise.resolve({ data: answer(fn), error: null });
    },
  };
  await placeStation(spy, { id: ID, lat: -1.28, lng: 36.78 });
  await adoptSuggestion(spy, ID);
  await stationHere(spy, { id: ID, lat: -1.28, lng: 36.78, accuracyM: 12.5 });
  await stationHere(spy, { id: ID, lat: -1.28, lng: 36.78, accuracyM: null });
  eq("the calls the database's functions take", calls, [
    ["place_station", { _station_id: ID, _lat: -1.28, _lng: 36.78 }],
    ["use_station_suggestion", { _station_id: ID }],
    ["station_here", { _station_id: ID, _lat: -1.28, _lng: 36.78, _accuracy: 12.5 }],
    ["station_here", { _station_id: ID, _lat: -1.28, _lng: 36.78, _accuracy: null }],
  ]);
}

// What a person is told when it goes wrong: our own messages, never the database's.
{
  const refusing = (code: string, message: string): Client => ({
    from: () => {
      throw new Error("unused");
    },
    rpc: () => Promise.resolve({ data: null, error: { code, message } }),
  });
  const pin = { id: ID, lat: -1.28, lng: 36.78 };
  eq(
    "a message the database wrote for people passes through",
    await thrown(() =>
      placeStation(refusing("P0001", "That is more than 2 km from the centre's ward."), pin),
    ),
    "That is more than 2 km from the centre's ward.",
  );
  eq(
    "so does its refusal of someone who may not place centres",
    await thrown(() =>
      placeStation(refusing("42501", "Only organisers and managers can place a centre."), pin),
    ),
    "Only organisers and managers can place a centre.",
  );
  eq(
    "anything else says only that it couldn't, and leaves the database's words out",
    await thrown(() => placeStation(refusing("XX000", 'relation "secret_table" is broken'), pin)),
    "Could not place the centre.",
  );
  eq(
    "the same for taking an agent's suggestion",
    await thrown(() => adoptSuggestion(refusing("XX000", "boom"), ID)),
    "Could not use that position.",
  );
  eq(
    "and for I'm here",
    await thrown(() => stationHere(refusing("XX000", "boom"), { ...pin, accuracyM: 10 })),
    "Could not confirm the centre.",
  );
}

// What I'm here answers.
{
  const replies = (data: unknown): Client => ({
    from: () => {
      throw new Error("unused");
    },
    rpc: () => Promise.resolve({ data, error: null }),
  });
  const here = { id: ID, lat: -1.28, lng: 36.78, accuracyM: 12.5 };
  eq("the position became the centre's", await stationHere(replies({ moved: true }), here), {
    moved: true,
    why: null,
  });
  eq(
    "kept as a suggestion, and why",
    await stationHere(replies({ moved: false, why: "distance" }), here),
    { moved: false, why: "distance" },
  );
  eq(
    "an answer it can't read is not a move",
    await stationHere(replies({ moved: "yes", why: 7 }), here),
    { moved: false, why: null },
  );
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
