// Checks for the Claude request and its answer: the model, the body, and an answer read for how it
// ended. Claude is the backup when Gemini cannot answer. Pure; nothing leaves this process. Run from
// the repository root:
//   npx tsx --tsconfig tsconfig.json tests/claude.test.ts

import { answerFault } from "@/lib/ai-answer";
import {
  CLAUDE_MODELS,
  CLAUDE_URL,
  CLAUDE_VERSION,
  claudeAnswer,
  claudeBody,
  claudeError,
} from "@/lib/claude";

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
  "Anthropic's address, and the version of its API the request asks for",
  [CLAUDE_URL, CLAUDE_VERSION],
  ["https://api.anthropic.com/v1/messages", "2026-10-21"],
);
eq("both tiers use Haiku 5.5, the cheapest of the family", CLAUDE_MODELS, {
  read: "claude-haiku-5-5",
  write: "claude-haiku-5-5",
});

const schema = {
  type: "object",
  required: ["results"],
  properties: { results: { type: "array" } },
};
const body = claudeBody("claude-haiku-5-5", "Read these.", schema);
eq("the body carries the prompt and forces one tool whose schema is the answer's", body, {
  model: "claude-haiku-5-5",
  max_tokens: 8192,
  messages: [{ role: "user", content: "Read these." }],
  tools: [
    { name: "answer", description: "Give the answer, as this schema says.", input_schema: schema },
  ],
  tool_choice: { type: "tool", name: "answer" },
});
eq(
  "no sampling settings are sent: Haiku 5.5 refuses them",
  ["temperature", "top_p", "top_k"].some((k) => k in body),
  false,
);

// ----------------------------------------------------------------- the answer

const call = (input: unknown, name = "answer") => ({
  type: "tool_use",
  id: "toolu_1",
  name,
  input,
});
const reply = (content: unknown[], stop_reason = "tool_use") => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  content,
  stop_reason,
  usage: { input_tokens: 10, output_tokens: 5 },
});

const done = claudeAnswer(reply([call({ results: [] })]));
eq("the tool's input is the answer, as JSON text", done, {
  text: '{"results":[]}',
  end: "completed",
  reason: null,
});
eq("a finished answer has no fault", answerFault(done), null);
eq(
  "words written beside the tool call are left out",
  claudeAnswer(reply([{ type: "text", text: "Here you go." }, call({ results: [] })])).text,
  '{"results":[]}',
);

const cut = claudeAnswer(reply([call({ results: [{ id: "1" }] })], "max_tokens"));
eq("an answer that reached its length limit is cut off", cut.end, "incomplete");
eq(
  "and says so in words",
  answerFault(cut),
  "AI answer cut off (the answer reached its length limit).",
);

const declined = claudeAnswer(reply([], "refusal"));
eq("a refusal failed", declined.end, "failed");
eq("and says why", answerFault(declined), "AI answer failed: it declined to answer.");

const talked = claudeAnswer(reply([{ type: "text", text: "I cannot say." }], "end_turn"));
eq("words and no tool call is a failure", talked.end, "failed");
eq("with the reason in words", answerFault(talked), "AI answer failed: no answer came back.");
eq(
  "another tool's input is not the answer",
  claudeAnswer(reply([call({ results: [] }, "other")])).end,
  "failed",
);
eq("nothing at all is a failure", claudeAnswer(null).end, "failed");

// ---------------------------------------------------------------- the failures

eq(
  "Claude's own words for a refusal",
  claudeError(
    JSON.stringify({
      type: "error",
      error: { type: "rate_limit_error", message: "Number of requests exceeded your rate limit." },
      request_id: "req_1",
    }),
  ),
  "rate_limit_error: Number of requests exceeded your rate limit.",
);
eq("a plain-text refusal is cut short", claudeError("x".repeat(300)).length, 180);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
