// Checks for the Gemini request and its answer: the models, the body, and an answer read for how it
// ended. Pure; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/gemini.test.ts

import { answerFault } from "@/lib/ai-answer";
import {
  GEMINI_MODELS,
  geminiAnswer,
  geminiBody,
  geminiBusy,
  geminiError,
  geminiKeyRefused,
  geminiUrl,
} from "@/lib/gemini";
import { askAiJson, PauseError } from "@/lib/listening.server";

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

// ---------------------------------------------------------------- the request

eq(
  "a model's address",
  geminiUrl("gemini-3.5-flash-lite"),
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
);
eq(
  "reading posts uses the lighter models, writing the better ones, each with a second to ask",
  [GEMINI_MODELS.read.length, GEMINI_MODELS.write.length],
  [2, 2],
);
eq(
  "the two tiers share no model",
  GEMINI_MODELS.read.some((m) => (GEMINI_MODELS.write as readonly string[]).includes(m)),
  false,
);
eq(
  "busy or broken on Google's side; a limit or a refusal is not",
  [500, 503, 504, 400, 403, 429].map(geminiBusy),
  [true, true, true, false, false, false],
);

const schema = {
  type: "object",
  required: ["results"],
  properties: { results: { type: "array" } },
};
eq(
  "the body carries the prompt and holds the answer to the schema",
  geminiBody("Read these.", schema),
  {
    contents: [{ role: "user", parts: [{ text: "Read these." }] }],
    generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema },
  },
);

// ----------------------------------------------------------------- the answer

const reply = (parts: unknown[], finishReason?: string) => ({
  candidates: [{ content: { role: "model", parts }, ...(finishReason ? { finishReason } : {}) }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
});

const done = geminiAnswer(reply([{ text: '{"results":' }, { text: "[]}" }], "STOP"));
eq("an answer in parts is joined", done, {
  text: '{"results":[]}',
  end: "completed",
  reason: null,
});
eq("a finished answer has no fault", answerFault(done), null);

eq(
  "thinking is left out of the answer",
  geminiAnswer(reply([{ text: "weighing the posts", thought: true }, { text: "{}" }], "STOP")).text,
  "{}",
);

const cut = geminiAnswer(reply([{ text: '{"results":[{"id"' }], "MAX_TOKENS"));
eq("an answer that hit its length limit is cut off", cut.end, "incomplete");
eq(
  "and says so in words",
  answerFault(cut),
  "AI answer cut off (the answer reached its length limit).",
);

const unsafe = geminiAnswer(reply([], "SAFETY"));
eq("an answer stopped for safety failed", unsafe.end, "failed");
eq("and says why", answerFault(unsafe), "AI answer failed: it stopped with safety.");

const blocked = geminiAnswer({ promptFeedback: { blockReason: "PROHIBITED_CONTENT" } });
eq(
  "a blocked request failed",
  answerFault(blocked),
  "AI answer failed: the request was blocked (PROHIBITED_CONTENT).",
);

eq("no candidates is a failure", geminiAnswer({ candidates: [] }).end, "failed");
eq("nothing at all is a failure", geminiAnswer(null).end, "failed");
eq(
  "text with no stated ending is taken as finished",
  geminiAnswer(reply([{ text: "{}" }])).end,
  "completed",
);
eq(
  "an empty finished answer is faulted",
  answerFault(geminiAnswer(reply([{ text: "  " }], "STOP"))),
  "AI answer empty.",
);

// ---------------------------------------------------------------- the failures

eq(
  "Gemini's own words for a refusal",
  geminiError(
    JSON.stringify({
      error: { code: 403, status: "PERMISSION_DENIED", message: "Billing is not enabled." },
    }),
  ),
  "PERMISSION_DENIED: Billing is not enabled.",
);
eq("a plain-text refusal is cut short", geminiError("x".repeat(300)).length, 180);

const BAD_KEY = JSON.stringify({
  error: {
    code: 400,
    status: "INVALID_ARGUMENT",
    message: "API key not valid. Please pass a valid API key.",
    details: [{ reason: "API_KEY_INVALID" }],
  },
});
eq("a wrong key is turned away", geminiKeyRefused(400, BAD_KEY), true);
eq("so is a 401", geminiKeyRefused(401, "{}"), true);
eq("a 429 is a limit, not the key", geminiKeyRefused(429, "{}"), false);
eq(
  "a 400 about the request itself is not the key",
  geminiKeyRefused(400, JSON.stringify({ error: { message: "Invalid JSON payload" } })),
  false,
);

// ------------------------------------------------------- a busy model, the next

const BUSY = JSON.stringify({
  error: {
    code: 503,
    status: "UNAVAILABLE",
    message: "This model is currently experiencing high demand.",
  },
});
const OK = JSON.stringify(reply([{ text: '{"headline":"x"}' }], "STOP"));

/** Gemini stood in for: each model answers as `answers` says; the models asked, in order. */
function stubGemini(answers: Record<string, { status: number; body: string }>) {
  const asked: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    const model = /models\/([^:]+):/.exec(String(url))?.[1] ?? "";
    asked.push(model);
    const a = answers[model] ?? { status: 404, body: "{}" };
    return new Response(a.body, { status: a.status });
  }) as typeof fetch;
  return asked;
}

async function main() {
  process.env["GEMINI_API_KEY"] = "test-key";
  const [first, second] = GEMINI_MODELS.write;
  const ask = () => askAiJson<{ headline: string }>("Write it.", "story", schema);

  {
    const asked = stubGemini({
      [first]: { status: 503, body: BUSY },
      [second]: { status: 200, body: OK },
    });
    eq("a busy model hands the question to the next, which answers", await ask(), {
      headline: "x",
    });
    eq("both were asked, best first", asked, [first, second]);
  }
  {
    const asked = stubGemini({ [first]: { status: 200, body: OK } });
    await ask();
    eq("a model that answers is the only one asked", asked, [first]);
  }
  {
    stubGemini({ [first]: { status: 503, body: BUSY }, [second]: { status: 503, body: BUSY } });
    const err = await ask().catch((e: Error) => e);
    eq(
      "every model busy: the last refusal, in Google's words",
      String((err as Error).message),
      "AI request failed (503): UNAVAILABLE: This model is currently experiencing high demand.",
    );
  }
  {
    const asked = stubGemini({
      [first]: { status: 429, body: "{}" },
      [second]: { status: 200, body: OK },
    });
    const err = await ask().catch((e: Error) => e);
    eq("a limit reached stops at once", [err instanceof PauseError, asked], [true, [first]]);
  }
  {
    const asked = stubGemini({
      [first]: { status: 400, body: "{}" },
      [second]: { status: 200, body: OK },
    });
    const err = await ask().catch((e: Error) => e);
    eq(
      "a request Google calls wrong is not asked again",
      [String((err as Error).message).startsWith("AI request failed (400)"), asked],
      [true, [first]],
    );
  }
  {
    const [lite, liteNext] = GEMINI_MODELS.read;
    const asked = stubGemini({
      [lite]: { status: 503, body: BUSY },
      [liteNext]: { status: 200, body: OK },
    });
    await askAiJson("Read these.", "moods", schema, 90_000, "read");
    eq("reading falls back within its own tier", asked, [lite, liteNext]);
  }

  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

void main();
