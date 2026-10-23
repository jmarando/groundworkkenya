// Inbox's channel card: each channel's real state, the social accounts with their live switch,
// and reading moods on messages that have none. Moved here from the old Social page.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { useAccess } from "@/hooks/useAccess";
import { connectPage, getChannels, setSocialToken } from "@/lib/channels.functions";
import { stamp } from "@/lib/format";
import { analyseSentiment, saveSocialAccount } from "@/lib/social.functions";

const PILL: Record<string, { cls: string; glyph: string }> = {
  ok: { cls: "pill--ok", glyph: "●" },
  amber: { cls: "pill--amber", glyph: "◐" },
  off: { cls: "pill--muted", glyph: "○" },
};

export function Channels() {
  const fetchChannels = useServerFn(getChannels);
  const saveAccount = useServerFn(saveSocialAccount);
  const saveToken = useServerFn(setSocialToken);
  const connect = useServerFn(connectPage);
  const [pageToken, setPageToken] = useState("");
  const { access } = useAccess();
  const isSuper = access?.role === "super";
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const runAnalysis = useServerFn(analyseSentiment);
  const qc = useQueryClient();
  const { data, isError, refetch } = useQuery({
    queryKey: ["channels"],
    queryFn: () => fetchChannels(),
  });
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<string>) {
    setBusy(true);
    setNote(null);
    try {
      setNote(await fn());
      await qc.invalidateQueries({ queryKey: ["channels"] });
      await qc.invalidateQueries({ queryKey: ["inbox"] });
    } catch (e) {
      setNote(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fd-section fx3" style={{ marginTop: 22 }}>
      <div className="card-head">
        <span className="eyebrow">Channels · what is set up for this campaign</span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const r = await runAnalysis({ data: { limit: 40 } });
              return r.error
                ? r.error
                : r.analysed === 0
                  ? "Every message already has a mood."
                  : `Read the mood of ${r.analysed} message${r.analysed === 1 ? "" : "s"}.`;
            })
          }
        >
          {busy ? "Reading…" : "Read moods"}
        </button>
      </div>
      {note && (
        <p className="f-note" aria-live="polite">
          {note}
        </p>
      )}
      {isError ? (
        <p className="f-note" role="alert">
          Couldn&apos;t read the channels.{" "}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void refetch()}>
            Try again
          </button>
        </p>
      ) : (
        <div className="conn">
          {(data?.statuses ?? []).map((c) => (
            <div className="conn-item" key={c.code}>
              <span className={`ch ${c.cls}`}>{c.code}</span>
              <b>{c.name}</b>
              <p>{c.note}</p>
              <span className={`pill ${PILL[c.state]?.cls ?? "pill--muted"}`}>
                <span className="g" aria-hidden="true">
                  {PILL[c.state]?.glyph}
                </span>{" "}
                {c.label}
              </span>
            </div>
          ))}
        </div>
      )}
      {(data?.accounts ?? []).length > 0 && (
        <div className="f-rows" style={{ marginTop: 14 }}>
          {(data?.accounts ?? []).map((a) => (
            <div className="f-row" key={a.id}>
              <span>
                <b>{a.displayName ?? a.platform}</b> <span className="mono">{a.handle}</span>
              </span>
              <span className="num mono">
                {a.live ? "live" : "not live"}
                {a.platform === "facebook" || a.platform === "instagram"
                  ? a.canReply
                    ? " · replies connected"
                    : " · replies not connected"
                  : ""}
                {a.lastEventAt ? ` · last in ${stamp(a.lastEventAt)}` : ""}
              </span>
              {isSuper && (a.platform === "facebook" || a.platform === "instagram") && (
                <span className="row-gap">
                  <input
                    aria-label={`Page access token for ${a.handle}`}
                    placeholder={a.canReply ? "Replace the Page token" : "Page access token"}
                    value={tokens[a.id] ?? ""}
                    onChange={(e) => setTokens({ ...tokens, [a.id]: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={busy || !(tokens[a.id] ?? "").trim()}
                    onClick={() =>
                      void act(async () => {
                        await saveToken({ data: { accountId: a.id, token: tokens[a.id] ?? "" } });
                        setTokens({ ...tokens, [a.id]: "" });
                        return `Replies on ${a.handle} are connected.`;
                      })
                    }
                  >
                    Connect replies
                  </button>
                </span>
              )}
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await saveAccount({ data: { id: a.id, live: !a.live } });
                    return a.live ? `${a.handle} switched off.` : `${a.handle} is live.`;
                  })
                }
              >
                {a.live ? "Switch off" : "Switch live"}
              </button>
            </div>
          ))}
        </div>
      )}
      {isSuper && (
        <div className="card ch-connect" style={{ marginTop: 14 }}>
          <b>Connect a Facebook Page (and its Instagram)</b>
          <ol className="ac-howto">
            <li>
              In Meta Business Settings → System users, give a system user the Page, then Generate
              token for this app with pages_messaging, pages_manage_metadata, pages_read_engagement
              and instagram_manage_messages.
            </li>
            <li>
              Paste the token here. Groundwork finds the Page and its Instagram, and subscribes them
              to messages.
            </li>
          </ol>
          {!data?.metaWebhook && (
            <p className="f-note" role="alert">
              Meta can&apos;t deliver messages yet: set META_APP_SECRET and META_VERIFY_TOKEN on the
              server, and give Meta the webhook{" "}
              <span className="mono">{data?.metaWebhookUrl ?? "/api/public/social/meta"}</span> with
              the same verify token.
            </p>
          )}
          <div className="ac-row">
            <input
              className="input"
              aria-label="Page access token"
              placeholder="Page access token"
              value={pageToken}
              onChange={(e) => setPageToken(e.target.value)}
            />
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={busy || pageToken.trim().length < 20}
              onClick={() =>
                void act(async () => {
                  const r = await connect({ data: { token: pageToken } });
                  setPageToken("");
                  return `${r.page}${r.instagram ? ` and @${r.instagram}` : ""} connected.${
                    r.subscribed
                      ? " Messages to them now land in this Inbox."
                      : ` Subscribing to messages failed: ${r.note ?? "unknown"}.`
                  }`;
                })
              }
            >
              Connect
            </button>
          </div>
        </div>
      )}
      <p className="f-note" style={{ marginTop: 12 }}>
        Facebook, Instagram and WhatsApp messages arrive at{" "}
        <span className="mono">{data?.metaWebhookUrl ?? "/api/public/social/meta"}</span>, X at{" "}
        <span className="mono">/api/public/social/x</span>. Replies to an account are held until it
        is switched live.
      </p>
    </div>
  );
}
