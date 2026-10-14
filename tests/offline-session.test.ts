// Checks for the sign-in kept on the phone: Supabase's storage key, reading a
// stored session (even one whose hour-long access has run out), telling no
// signal from a refusal, who enters the signed-in area when Supabase answers,
// refuses, fails or doesn't answer in time, and signing out with no signal.
// Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/offline-session.test.ts

import type { User } from "@supabase/supabase-js";

import {
  entryUser,
  sessionKey,
  signOutHere,
  unreachable,
  userIn,
  within,
} from "@/lib/offline/session";

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

const me = { id: "u1", email: "agent@example.test" } as User;
const stored = (o: Record<string, unknown>) => JSON.stringify(o);
const HOUR_AGO = Math.floor(Date.parse("2026-10-14T08:00:00Z") / 1000);

// ---------------------------------------------------------------- the stored session

eq(
  "Supabase's key for the project",
  sessionKey("https://abcdefghijklmnop.supabase.co"),
  "sb-abcdefghijklmnop-auth-token",
);
eq(
  "a stored session's user, even when its access has run out",
  userIn(stored({ access_token: "a", refresh_token: "r", expires_at: HOUR_AGO, user: me })),
  me,
);
eq(
  "nothing stored, unreadable, no refresh token, or no user: nobody",
  [
    userIn(null),
    userIn("{not json"),
    userIn(stored({ access_token: "a", user: me })),
    userIn(stored({ access_token: "a", refresh_token: "r", user: {} })),
    userIn("null"),
  ],
  [null, null, null, null, null],
);

// ---------------------------------------------------------------- no signal or a refusal

eq(
  "no signal, a fetch that failed in any browser, or Supabase's retryable error; not a refusal",
  [
    unreachable(null, false),
    unreachable({ name: "AuthRetryableFetchError", message: "Gateway timeout" }, true),
    unreachable(new TypeError("Failed to fetch"), true),
    unreachable(new Error("Load failed"), true),
    unreachable(new Error("NetworkError when attempting to fetch resource."), true),
    unreachable({ name: "AuthApiError", message: "Invalid JWT" }, true),
    unreachable({ name: "AuthSessionMissingError", message: "Auth session missing!" }, true),
    unreachable(null, true),
  ],
  [true, true, true, true, true, false, false, false],
);

// ---------------------------------------------------------------- in time or not

{
  const later = <T>(value: T, ms: number) => new Promise<T>((r) => setTimeout(() => r(value), ms));
  eq("an answer in time", await within(later("yes", 1), 50), "yes");
  eq("no answer in time", await within(later("yes", 50), 1), undefined);
  let refused: unknown;
  await within(Promise.reject(new Error("no")), 50).catch((e: Error) => (refused = e.message));
  eq("a failure in time is the failure", refused, "no");
}

// ---------------------------------------------------------------- who enters

{
  const answers =
    (data: { user: User | null }, error: unknown = null) =>
    async () => ({ data, error });
  const kept = () => me;
  const nobody = () => null;
  const never = () => new Promise<never>(() => {});
  const other = { id: "u2" } as User;
  eq(
    "Supabase's answer when it gives one",
    await entryUser(answers({ user: other }), kept, true),
    other,
  );
  eq(
    "a refusal or no session: sign in, whatever is kept",
    [
      await entryUser(
        answers({ user: null }, { name: "AuthApiError", message: "Invalid JWT" }),
        kept,
        true,
      ),
      await entryUser(answers({ user: null }, { name: "AuthSessionMissingError" }), kept, true),
    ],
    [null, null],
  );
  eq(
    "no signal, a failed fetch or a retryable error: the phone's sign-in",
    [
      await entryUser(answers({ user: null }, { name: "AuthRetryableFetchError" }), kept, true),
      await entryUser(async () => Promise.reject(new TypeError("Failed to fetch")), kept, true),
      await entryUser(answers({ user: null }, { name: "AuthApiError" }), kept, false),
    ],
    [me, me, me],
  );
  eq("no answer in time: the phone's sign-in", await entryUser(never, kept, true, 5), me);
  eq(
    "unreachable with no sign-in kept: sign in",
    await entryUser(answers({ user: null }, { name: "AuthRetryableFetchError" }), nobody, true),
    null,
  );
}

// ---------------------------------------------------------------- signing out

{
  const deleted: string[] = [];
  const forget = (why: string) => () => void deleted.push(why);
  await signOutHere(async () => ({ error: null }), forget("signed out"));
  await signOutHere(
    async () => ({ error: { name: "AuthRetryableFetchError" } }),
    forget("no signal"),
  );
  await signOutHere(() => Promise.reject(new TypeError("Failed to fetch")), forget("failed"));
  eq(
    "Supabase's sign-out deletes the session itself; when it can't, the phone's copy is deleted here",
    deleted,
    ["no signal", "failed"],
  );
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
