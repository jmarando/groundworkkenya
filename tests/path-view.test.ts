// Checks for what the Path to State House screen works out for itself: which
// side a campaign starts from, how a region's moves are kept, and how a move or
// a lead is worded. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/path-view.test.ts

import {
  RANGE,
  bySize,
  commonMove,
  lead,
  setAll,
  setMove,
  sideFromBloc,
  signed,
} from "@/lib/path-view";

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

// ------------------------------------------------------------- the side a campaign starts from

eq(
  "the two blocs of 2022",
  [sideFromBloc("Kenya Kwanza"), sideFromBloc("Azimio")],
  ["ruto", "raila"],
);
eq(
  "case and spaces do not matter, and a longer name starting the same is the same bloc",
  [
    sideFromBloc("  kenya   KWANZA "),
    sideFromBloc("AZIMIO"),
    sideFromBloc("Azimio La Umoja One Kenya"),
    sideFromBloc("Kenya Kwanza Alliance"),
  ],
  ["ruto", "raila", "raila", "ruto"],
);
eq(
  "any other bloc, or none, is no side",
  [
    sideFromBloc("NASA"),
    sideFromBloc("Jubilee"),
    sideFromBloc(""),
    sideFromBloc(null),
    sideFromBloc(undefined),
  ],
  [null, null, null, null, null],
);
eq("a name that only contains a bloc's is no side", sideFromBloc("Not Azimio"), null);

// ------------------------------------------------------------- the moves kept

{
  const none = {};
  const one = setMove(none, "coast", { share: 5 });
  eq("a move is added", one, { coast: { share: 5, turnout: 0 } });
  eq("the empty scenario is untouched", none, {});
  const two = setMove(one, "coast", { turnout: -3 });
  eq("a second part merges with the first", two, { coast: { share: 5, turnout: -3 } });
  eq("and the first scenario is untouched", one, { coast: { share: 5, turnout: 0 } });
  eq("another region sits beside it", setMove(two, "western", { share: -2 }), {
    coast: { share: 5, turnout: -3 },
    western: { share: -2, turnout: 0 },
  });
  eq(
    "a region at zero and zero is dropped",
    setMove(setMove(two, "coast", { share: 0 }), "coast", { turnout: 0 }),
    {},
  );
  eq("a region left with one part keeps it", setMove(two, "coast", { share: 0 }), {
    coast: { share: 0, turnout: -3 },
  });
  eq(
    "setting a region that has no move to zero adds nothing",
    setMove({}, "coast", { share: 0 }),
    {},
  );
}

// ------------------------------------------------------------- the same move for every region

{
  const keys = ["a", "b", "c"];
  const none = {};
  const five = setAll(none, keys, { share: 5 });
  eq("a part of every listed move is set", five, {
    a: { share: 5, turnout: 0 },
    b: { share: 5, turnout: 0 },
    c: { share: 5, turnout: 0 },
  });
  eq("the empty scenario is untouched", none, {});
  eq("the other part merges with the first", setAll(five, keys, { turnout: -2 }), {
    a: { share: 5, turnout: -2 },
    b: { share: 5, turnout: -2 },
    c: { share: 5, turnout: -2 },
  });
  eq("and the first scenario is untouched", five["a"], { share: 5, turnout: 0 });
  eq("keys left at zero and zero are dropped", setAll(five, keys, { share: 0 }), {});
  eq(
    "keys not listed are left alone",
    setAll({ z: { share: 1, turnout: 2 } }, ["a"], { share: 3 }),
    { z: { share: 1, turnout: 2 }, a: { share: 3, turnout: 0 } },
  );
  eq(
    "a move already there for a listed key is kept in the part not given",
    setAll({ a: { share: 1, turnout: 4 } }, keys, { share: 9 })["a"],
    { share: 9, turnout: 4 },
  );
  eq("with no keys nothing changes", setAll(five, [], { share: 9 }), five);
  eq("nothing set: zero and zero", commonMove({}, keys), { share: 0, turnout: 0 });
  eq("all alike: that move", commonMove(five, keys), { share: 5, turnout: 0 });
  eq(
    "differing shares: null, turnout still common",
    commonMove(setMove(five, "b", { share: 7 }), keys),
    { share: null, turnout: 0 },
  );
  eq(
    "differing turnouts: null",
    commonMove(setMove(five, "c", { turnout: 3 }), keys).turnout,
    null,
  );
  eq("one set and the rest not: null", commonMove({ a: { share: 5, turnout: 0 } }, keys), {
    share: null,
    turnout: 0,
  });
  eq("a subset of the keys", commonMove(setMove(five, "c", { share: 8 }), ["a", "b"]), {
    share: 5,
    turnout: 0,
  });
  eq("no keys: zero and zero", commonMove(five, []), { share: 0, turnout: 0 });
}

// ------------------------------------------------------------- the sliders' reach

eq("the sliders' reach", RANGE, { share: 20, turnout: 15 });

// ------------------------------------------------------------- how a move is worded

eq(
  "a signed number",
  [signed(5), signed(-3), signed(0), signed(12.4), signed(-12.6)],
  ["+5", "−3", "0", "+12", "−13"],
);
eq(
  "with thousands and a unit",
  [signed(136993.3), signed(-1234567), signed(5, " pts"), signed(-2, " pts"), signed(0, " pts")],
  ["+136,993", "−1,234,567", "+5 pts", "−2 pts", "0 pts"],
);
eq(
  "a hair either side of zero is zero",
  [signed(0.4), signed(-0.4), signed(-0.5, " pts")],
  ["0", "0", "0 pts"],
);

// ------------------------------------------------------------- the lead

eq(
  "ahead, behind and level",
  [lead(233211), lead(-233211), lead(36979.7), lead(0), lead(0.4), lead(-0.4)],
  [
    { label: "Ahead by", text: "233,211" },
    { label: "Behind by", text: "233,211" },
    { label: "Ahead by", text: "36,980" },
    { label: "Level", text: "" },
    { label: "Level", text: "" },
    { label: "Level", text: "" },
  ],
);

// ------------------------------------------------------------- regions by size

{
  const rs = [
    { id: "d", name: "Delta", valid: 10 },
    { id: "a", name: "Alpha", valid: 30 },
    { id: "b", name: "Beta", valid: 10 },
    { id: "c", name: "Gamma", valid: 20 },
  ];
  eq(
    "the biggest first, a tie by name",
    bySize(rs).map((r) => r.id),
    ["a", "c", "b", "d"],
  );
  eq(
    "and the list given is not reordered",
    rs.map((r) => r.id),
    ["d", "a", "b", "c"],
  );
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
