// Checks for the backup AI: when Gemini cannot answer (a limit reached, the key or plan turned away,
// busy, too slow), askAiJson asks Claude Haiku instead, if ANTHROPIC_API_KEY is set; and says so.
// Both providers are stood in for; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/ai-backup.test.ts

import { GEMINI_MODELS } from "@/lib/gemini";
import { askAiJson, PauseError, takeBackupNote } from "@/lib/listening.server";

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

const schema = {
  type: "object",
  required: ["headline"],
  properties: { headline: { type: "string" } },
};

const GEMINI_OK = JSON.stringify({
  candidates: [
    {
      content: { role: "model", parts: [{ text: '{"headline":"from gemini"}' }] },
      finishReason: "STOP",
    },
  ],
});
const CLAUDE_OK = JSON.stringify({
  id: "msg_1",
  type: "message",
  role: "assistant",
  stop_reason: "tool_use",
  content: [
    { type: "tool_use", id: "toolu_1", name: "answer", input: { headline: "from claude" } },
  ],
});
const limit = (quotaId: string) =>
  JSON.stringify({
    error: {
      code: 429,
      status: "RESOURCE_EXHAUSTED",
      message: "You exceeded your current quota.",
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.QuotaFailure",
          violations: [{ quotaId }],
        },
      ],
    },
  });
const DAY = limit("GenerateRequestsPerDayPerProjectPerModel-FreeTier");
const MINUTE = limit("GenerateRequestsPerMinutePerProjectPerModel-FreeTier");
const BUSY = JSON.stringify({
  error: {
    code: 503,
    status: "UNAVAILABLE",
    message: "This model is currently experiencing high demand.",
  },
});
const BAD_KEY = JSON.stringify({
  error: {
    code: 400,
    status: "INVALID_ARGUMENT",
    message: "API key not valid. Please pass a valid API key.",
    details: [{ reason: "API_KEY_INVALID" }],
  },
});
const CLAUDE_DOWN = JSON.stringify({
  type: "error",
  error: { type: "overloaded_error", message: "Overloaded" },
});

type Reply = { status: number; body: string };
type Seen = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

/** Both providers stood in for: Gemini answers per model (or alike), Claude as given. */
function stub(
  gemini: Reply | Record<string, Reply>,
  claude: Reply = { status: 200, body: CLAUDE_OK },
) {
  const asked: string[] = [];
  const claudeSeen: Seen[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("api.anthropic.com")) {
      asked.push("claude");
      claudeSeen.push({
        url: u,
        headers: init?.headers as Record<string, string>,
        body: JSON.parse(String(init?.body)),
      });
      return new Response(claude.body, { status: claude.status });
    }
    const model = /models\/([^:]+):/.exec(u)?.[1] ?? "";
    asked.push(model);
    const alike = typeof (gemini as Reply).status === "number";
    const g = alike
      ? (gemini as Reply)
      : ((gemini as Record<string, Reply>)[model] ?? { status: 404, body: "{}" });
    return new Response(g.body, { status: g.status });
  }) as typeof fetch;
  return { asked, claudeSeen };
}

async function main() {
  const [first, second] = GEMINI_MODELS.write;
  const ask = () => askAiJson<{ headline: string }>("Write it.", "story", schema);
  process.env["GEMINI_API_KEY"] = "gemini-key";
  process.env["ANTHROPIC_API_KEY"] = "claude-key";
  takeBackupNote();

  {
    const { asked } = stub({ [first]: { status: 200, body: GEMINI_OK } });
    eq(
      "Gemini answering, Claude is not asked",
      [await ask(), asked],
      [{ headline: "from gemini" }, [first]],
    );
    eq("and nothing is said about a backup", takeBackupNote(), null);
  }
  {
    const { asked, claudeSeen } = stub({ [first]: { status: 429, body: DAY } });
    eq(
      "Gemini's day used up: Claude answers",
      [await ask(), asked],
      [{ headline: "from claude" }, [first, "claude"]],
    );
    const sent = claudeSeen[0];
    eq(
      "asked at Anthropic's address, with the key and the API version",
      [sent?.url, sent?.headers["x-api-key"], sent?.headers["anthropic-version"]],
      ["https://api.anthropic.com/v1/messages", "claude-key", "2026-10-21"],
    );
    eq(
      "Haiku is asked, with the prompt and the forced tool",
      [
        sent?.body["model"],
        JSON.stringify(sent?.body["messages"]),
        JSON.stringify(sent?.body["tool_choice"]),
      ],
      [
        "claude-haiku-5-5",
        JSON.stringify([{ role: "user", content: "Write it." }]),
        JSON.stringify({ type: "tool", name: "answer" }),
      ],
    );
    eq(
      "the sweep is told, once",
      [takeBackupNote(), takeBackupNote()],
      [
        "Gemini could not answer (its limit was reached), so Claude Haiku, the backup AI, gave 1 answer.",
        null,
      ],
    );
  }
  {
    const { asked } = stub({
      [first]: { status: 503, body: BUSY },
      [second]: { status: 503, body: BUSY },
    });
    eq(
      "every Gemini model busy: Claude answers",
      [await ask(), asked],
      [{ headline: "from claude" }, [first, second, "claude"]],
    );
    eq(
      "and the note says why",
      takeBackupNote(),
      "Gemini could not answer (it was busy), so Claude Haiku, the backup AI, gave 1 answer.",
    );
  }
  {
    const { asked } = stub({
      [first]: { status: 429, body: MINUTE },
      [second]: { status: 429, body: MINUTE },
    });
    eq(
      "both models out of their minute: Claude answers",
      [await ask(), asked],
      [{ headline: "from claude" }, [first, second, "claude"]],
    );
    takeBackupNote();
  }
  {
    const { asked } = stub({ [first]: { status: 400, body: BAD_KEY } });
    eq(
      "a key Gemini turns away: Claude answers",
      [await ask(), asked],
      [{ headline: "from claude" }, [first, "claude"]],
    );
    eq(
      "and the note says the key or plan was refused",
      takeBackupNote(),
      "Gemini could not answer (its key or plan was refused), so Claude Haiku, the backup AI, gave 1 answer.",
    );
  }
  {
    stub({ [first]: { status: 429, body: DAY } });
    await ask();
    await ask();
    eq(
      "answers are counted until the sweep reports them",
      takeBackupNote(),
      "Gemini could not answer (its limit was reached), so Claude Haiku, the backup AI, gave 2 answers.",
    );
  }
  {
    const { asked } = stub(
      { [first]: { status: 429, body: DAY } },
      { status: 529, body: CLAUDE_DOWN },
    );
    const err = await ask().catch((e: Error) => e);
    eq(
      "Gemini and Claude both out: the stop is Gemini's, with Claude's reason added",
      [
        err instanceof PauseError,
        String((err as Error).message).startsWith("AI stopped (429)"),
        String((err as Error).message).includes(
          "The backup AI also failed: Claude request failed (529): overloaded_error: Overloaded",
        ),
        asked,
      ],
      [true, true, true, [first, "claude"]],
    );
    eq("and no backup answer is reported", takeBackupNote(), null);
  }
  {
    const { asked } = stub({
      [first]: {
        status: 400,
        body: JSON.stringify({ error: { message: "Invalid JSON payload." } }),
      },
    });
    const err = await ask().catch((e: Error) => e);
    eq(
      "a request Gemini calls wrong is ours to fix, not Claude's to answer",
      [String((err as Error).message).startsWith("AI request failed (400)"), asked],
      [true, [first]],
    );
  }
  {
    const { asked, claudeSeen } = stub(
      { [first]: { status: 200, body: GEMINI_OK } },
      { status: 200, body: CLAUDE_OK },
    );
    delete process.env["GEMINI_API_KEY"];
    eq(
      "with no Gemini key Claude is the AI, and that is no backup",
      [await ask(), asked, claudeSeen.length, takeBackupNote()],
      [{ headline: "from claude" }, ["claude"], 1, null],
    );
    process.env["GEMINI_API_KEY"] = "gemini-key";
  }
  {
    delete process.env["ANTHROPIC_API_KEY"];
    const { asked } = stub({ [first]: { status: 429, body: DAY } });
    const err = await ask().catch((e: Error) => e);
    eq(
      "with no Claude key a used-up day stops the AI, as before",
      [
        err instanceof PauseError,
        String((err as Error).message).startsWith("AI stopped (429)"),
        asked,
      ],
      [true, true, [first]],
    );
    process.env["ANTHROPIC_API_KEY"] = "claude-key";
  }
  {
    delete process.env["GEMINI_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
    const err = await ask().catch((e: Error) => e);
    eq(
      "with neither key the AI is not configured",
      [err instanceof PauseError, (err as Error).message],
      [true, "AI is not configured."],
    );
    process.env["GEMINI_API_KEY"] = "gemini-key";
    process.env["ANTHROPIC_API_KEY"] = "claude-key";
  }
  {
    const cutOff = JSON.stringify({
      id: "msg_2",
      type: "message",
      role: "assistant",
      stop_reason: "max_tokens",
      content: [{ type: "tool_use", id: "toolu_2", name: "answer", input: {} }],
    });
    stub({ [first]: { status: 429, body: DAY } }, { status: 200, body: cutOff });
    const err = await ask().catch((e: Error) => e);
    eq(
      "a backup answer that was cut off says so",
      (err as Error).message,
      "AI answer cut off (the answer reached its length limit).",
    );
    takeBackupNote();
  }

  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

void main();
