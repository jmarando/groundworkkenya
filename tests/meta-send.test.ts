// Checks for replies on Facebook and Instagram: the request Meta takes, and its answer in words.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/meta-send.test.ts

import { metaReplyRequest, readMetaAnswer } from "@/lib/meta-send";

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

eq("a Messenger reply", metaReplyRequest("facebook", "dm", "facebook:2345", " Asante! "), {
  path: "/me/messages",
  body: { recipient: { id: "2345" }, messaging_type: "RESPONSE", message: { text: "Asante!" } },
});
eq(
  "a Page comment is answered under it",
  metaReplyRequest("facebook", "comment", "facebook:111_222", "Karibu"),
  {
    path: "/111_222/comments",
    body: { message: "Karibu" },
  },
);
eq(
  "an Instagram comment uses replies",
  metaReplyRequest("instagram", "comment", "instagram:1789", "Thanks"),
  {
    path: "/1789/replies",
    body: { message: "Thanks" },
  },
);
eq("not Meta", metaReplyRequest("x", "dm", "x:1", "hi"), {
  error: "Only Facebook and Instagram replies go through Meta.",
});
eq("no thread", metaReplyRequest("facebook", "dm", null, "hi"), {
  error: "This conversation has no Meta thread to answer.",
});
eq(
  "a thread id can't smuggle a path",
  "error" in metaReplyRequest("facebook", "comment", "facebook:../me", "x"),
  true,
);

eq("sent", readMetaAnswer(200, JSON.stringify({ recipient_id: "2345", message_id: "m_1" })), {
  ok: true,
  id: "m_1",
});
eq(
  "outside the 24-hour window",
  readMetaAnswer(
    400,
    JSON.stringify({
      error: { code: 10, message: "(#10) This message is sent outside of allowed window." },
    }),
  ),
  {
    ok: false,
    error:
      "More than 24 hours have passed since they wrote, so Meta won't take a reply in Messenger.",
  },
);
eq(
  "no permission",
  readMetaAnswer(
    403,
    JSON.stringify({ error: { code: 200, message: "Requires pages_messaging permission" } }),
  ),
  { ok: false, error: "Meta has not given this Page permission to reply." },
);
eq(
  "an expired token",
  readMetaAnswer(
    400,
    JSON.stringify({ error: { code: 190, message: "Error validating access token" } }),
  ),
  { ok: false, error: "The Page's access token has expired; Groundwork needs to reconnect it." },
);
eq("unreadable", readMetaAnswer(502, "<html>"), {
  ok: false,
  error: "Meta's reply was unreadable (502).",
});

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
