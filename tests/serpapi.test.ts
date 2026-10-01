// Checks for asking SerpApi's Google Trends, and its daily budget. A stand-in
// answers instead of SerpApi; nothing leaves this process. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/serpapi.test.ts

import { serpConfigured, trendsAnswer } from "@/lib/serpapi.server";
import { dailyCredits } from "@/lib/social-credits";

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

async function rejects(name: string, p: Promise<unknown>, message: string) {
  try {
    await p;
    eq(name, "accepted", message);
  } catch (e) {
    eq(name, (e as Error).message, message);
  }
}

function stub(status: number, body: string) {
  const asked: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    asked.push(String(url));
    return new Response(body, { status });
  }) as typeof fetch;
  return asked;
}

async function main() {
  delete process.env["SERPAPI_API_KEY"];
  eq("no key, not connected", serpConfigured(), false);
  await rejects(
    "no key, nothing asked",
    trendsAnswer(["Sakaja"], "KE-110"),
    "SerpApi is not connected.",
  );

  process.env["SERPAPI_API_KEY"] = "test-key";
  const asked = stub(200, JSON.stringify({ interest_over_time: { timeline_data: [] } }));
  await trendsAnswer(["Sakaja", "Babu Owino"], "KE-110");
  const u = new URL(asked[0] ?? "https://x.test");
  eq(
    "Google Trends over thirty days, in Nairobi's time",
    [
      u.origin + u.pathname,
      u.searchParams.get("engine"),
      u.searchParams.get("q"),
      u.searchParams.get("geo"),
      u.searchParams.get("date"),
      u.searchParams.get("data_type"),
      u.searchParams.get("tz"),
      u.searchParams.get("api_key"),
    ],
    [
      "https://serpapi.com/search.json",
      "google_trends",
      "Sakaja,Babu Owino",
      "KE-110",
      "today 1-m",
      "TIMESERIES",
      "-180",
      "test-key",
    ],
  );
  const commas = stub(200, JSON.stringify({ interest_over_time: { timeline_data: [] } }));
  await trendsAnswer(["water, sewage"], "KE");
  eq(
    "a comma in a term doesn't split it",
    new URL(commas[0] ?? "https://x.test").searchParams.get("q"),
    "water  sewage",
  );
  stub(200, JSON.stringify({ error: "Invalid API key." }));
  await rejects("SerpApi's own refusal", trendsAnswer(["Sakaja"], "KE"), "Invalid API key.");
  stub(500, "<html>down</html>");
  await rejects("SerpApi down", trendsAnswer(["Sakaja"], "KE"), "SerpApi answered 500.");

  eq("the trends limit is 8", dailyCredits("trends"), 8);
  process.env["SERPAPI_DAILY_SEARCHES"] = "5";
  eq("and set by its own variable", dailyCredits("trends"), 5);
  delete process.env["SERPAPI_DAILY_SEARCHES"];
  eq("the others keep theirs", [dailyCredits("rivals"), dailyCredits("keywords")], [60, 60]);

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
