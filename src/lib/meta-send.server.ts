// Sending a reply through Meta with the account's Page token (social_account_tokens, read with the
// service role only).
import { GRAPH, readMetaAnswer, type MetaReply } from "@/lib/meta-send";

export async function sendMetaReply(
  token: string,
  req: Extract<MetaReply, { path: string }>,
): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${GRAPH}${req.path}`, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(req.body),
    });
    return readMetaAnswer(res.status, await res.text());
  } catch (e) {
    return { ok: false, error: `Couldn't reach Meta: ${(e as Error).message}` };
  }
}
