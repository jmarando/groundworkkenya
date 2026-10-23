// A reply on Facebook or Instagram as Meta's Graph API takes it. Pure: the request and reading the
// answer. A direct message answers within Meta's 24-hour window through the Page's Send API; a
// comment is answered under the comment itself.

export const GRAPH = "https://graph.facebook.com/v21.0";

export type MetaReply = { path: string; body: Record<string, unknown> } | { error: string };

/**
 * The request for a reply in a conversation. `thread` is the conversation's external thread
 * ("facebook:<sender or comment id>"), `kind` whether it began as a message or a comment.
 */
export function metaReplyRequest(
  platform: string,
  kind: "dm" | "comment",
  thread: string | null,
  text: string,
): MetaReply {
  if (platform !== "facebook" && platform !== "instagram")
    return { error: "Only Facebook and Instagram replies go through Meta." };
  const id = (thread ?? "").replace(/^(facebook|instagram):/, "");
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(id))
    return { error: "This conversation has no Meta thread to answer." };
  const message = text.trim().slice(0, 2000);
  if (!message) return { error: "Write something before sending." };
  if (kind === "dm") {
    return {
      path: "/me/messages",
      body: { recipient: { id }, messaging_type: "RESPONSE", message: { text: message } },
    };
  }
  return platform === "instagram"
    ? { path: `/${id}/replies`, body: { message } }
    : { path: `/${id}/comments`, body: { message } };
}

/** Meta's answer: the new message or comment's id, or why it refused, in words for the team. */
export function readMetaAnswer(
  status: number,
  text: string,
): { ok: true; id: string | null } | { ok: false; error: string } {
  let json: { id?: string; message_id?: string; error?: { message?: string; code?: number } } = {};
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: `Meta's reply was unreadable (${status}).` };
  }
  if (status >= 200 && status < 300 && !json.error)
    return { ok: true, id: json.message_id ?? json.id ?? null };
  const code = json.error?.code;
  const said = json.error?.message ?? "";
  const why =
    code === 551 || /24 hour|outside of allowed window/i.test(said)
      ? "More than 24 hours have passed since they wrote, so Meta won't take a reply in Messenger."
      : code === 190
        ? "The Page's access token has expired; Groundwork needs to reconnect it."
        : code === 10 || code === 200
          ? "Meta has not given this Page permission to reply."
          : said || `Meta refused the reply (${status}).`;
  return { ok: false, error: why };
}
