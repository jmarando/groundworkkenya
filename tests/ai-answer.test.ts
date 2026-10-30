// Checks for reading the AI gateway's streamed answer (how it ended, frames split across chunks)
// and for any AI failure said in plain words. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/ai-answer.test.ts

import { aiStream, aiTrouble, answerFault } from "@/lib/ai-answer";

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

const frame = (o: unknown) => `event: x\ndata: ${JSON.stringify(o)}\n\n`;
const read = (...chunks: string[]) => {
  const s = aiStream();
  chunks.forEach((c) => s.push(c));
  return s.finish();
};
const delta = (d: string) => frame({ type: "response.output_text.delta", delta: d });

eq(
  "the text is the deltas joined, and a completed answer says so",
  read(delta('{"a":'), delta("1}"), frame({ type: "response.completed", response: {} })),
  { text: '{"a":1}', end: "completed", reason: null },
);

const whole = delta('{"headline":"x"}') + frame({ type: "response.completed" });
eq(
  "frames split anywhere across chunks, and CRLF line ends, read the same",
  [
    read(whole.slice(0, 7), whole.slice(7, 40), whole.slice(40)),
    read(whole.replace(/\n/g, "\r\n").slice(0, 33), whole.replace(/\n/g, "\r\n").slice(33)),
  ].map((a) => [a.text, a.end]),
  [
    ['{"headline":"x"}', "completed"],
    ['{"headline":"x"}', "completed"],
  ],
);

eq(
  "an answer cut off by its length says why, and is a fault",
  (() => {
    const a = read(
      delta('{"phases":[{"key":"bu'),
      frame({
        type: "response.incomplete",
        response: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } },
      }),
    );
    return [a.end, a.reason, answerFault(a)];
  })(),
  ["incomplete", "max_output_tokens", "AI answer cut off (max_output_tokens)."],
);

eq(
  "a failed answer and an error event carry the service's words",
  [
    read(
      frame({
        type: "response.failed",
        response: { error: { message: "server_error: try again" } },
      }),
    ),
    read(frame({ type: "error", message: "Invalid schema for response_format" })),
  ].map((a) => [a.end, a.reason]),
  [
    ["failed", "server_error: try again"],
    ["failed", "Invalid schema for response_format"],
  ],
);

eq(
  "a refusal with no text is a failure; malformed frames and [DONE] are skipped",
  [
    read(frame({ type: "response.refusal.delta", delta: "I can't help with that." })),
    read("data: {not json\n\n", "data: [DONE]\n\n", delta("{}")),
  ].map((a) => [a.text, a.end, a.reason]),
  [
    ["", "failed", "refused: I can't help with that."],
    ["{}", "open", null],
  ],
);

eq(
  "an empty answer is a fault; a stream that just stops is left for the parse to judge",
  [answerFault(read()), answerFault(read(delta("{}")))],
  ["AI answer empty.", null],
);

class PauseLike extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}
const timeout = Object.assign(new Error("The operation was aborted due to timeout"), {
  name: "TimeoutError",
});
eq(
  "each failure in plain words, and whether asking again may help",
  [
    new PauseLike(
      'AI stopped (402): {"status":402,"type":"payment_required","title":"Not enough credits"}',
      402,
    ),
    new Error('AI stopped (402): {"title":"Not enough credits"}'),
    new PauseLike("AI stopped (429): slow down", 429),
    new PauseLike("AI is not configured."),
    new Error("AI took too long (no full answer within 75 s)."),
    timeout,
    new Error("AI answer cut off (max_output_tokens)."),
    new SyntaxError("Unexpected end of JSON input"),
    new Error("AI request failed (500): upstream"),
    new PauseLike("AI stopped (400): INVALID_ARGUMENT: API key not valid.", 400),
  ].map((e) => {
    const t = aiTrouble(e);
    return [t.kind, t.retry];
  }),
  [
    ["credits", false],
    ["credits", false],
    ["busy", true],
    ["refused", false],
    ["slow", false],
    ["slow", false],
    ["cut", true],
    ["cut", true],
    ["broken", true],
    ["refused", false],
  ],
);
eq(
  "the words a campaign reads: each says who acts, nothing shows raw JSON",
  [
    aiTrouble(new Error('AI stopped (402): {"title":"Not enough credits"}')).words,
    aiTrouble(new Error("AI stopped (429): RESOURCE_EXHAUSTED: Quota exceeded.")).words,
    aiTrouble(new Error("AI stopped (400): INVALID_ARGUMENT: API key not valid.")).words,
    aiTrouble(new Error("AI request failed (500): upstream")).words,
  ],
  [
    "The AI has run out of credit. Groundwork's admin needs to check the AI account's billing; then try again.",
    "The AI is busy, or this month's spending cap is reached. Try again in a minute; if it keeps happening, Groundwork's admin should check the cap in Google AI Studio.",
    "The AI turned the request down. Groundwork's admin needs to check the AI key (GEMINI_API_KEY in Groundwork's secrets in Lovable).",
    "The AI couldn't answer (AI request failed (500): upstream). Try again; if it keeps happening, tell Groundwork.",
  ],
);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
