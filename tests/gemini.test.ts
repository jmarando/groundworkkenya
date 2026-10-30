// Checks for the Gemini request and its answer: the models, the body, and an answer read for how it
// ended. Pure; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/gemini.test.ts

import { answerFault } from "@/lib/ai-answer";
import {
  GEMINI_MODELS,
  geminiAnswer,
  geminiBody,
  geminiError,
  geminiKeyRefused,
  geminiUrl,
} from "@/lib/gemini";

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
  "reading posts uses the lighter model",
  geminiUrl("read"),
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELS.read}:generateContent`,
);
eq("writing uses the better one", geminiUrl("write").includes(GEMINI_MODELS.write), true);
eq("the two tiers differ", String(GEMINI_MODELS.read) !== String(GEMINI_MODELS.write), true);

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

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
