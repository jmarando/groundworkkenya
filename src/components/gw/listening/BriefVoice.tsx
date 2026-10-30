// Briefing a voice: why it is worth a brief (from its own public posts only), Daraja Pulse's standing
// lines (always shown, never removable), and a plain invitation to edit and copy for WhatsApp or a
// direct message. Nothing goes out by itself: the office reads it and sends it. Sending through Pulse
// stays off until Pulse can take it. Places, never people: a voice is only what it published.
import { useState } from "react";
import { toast } from "sonner";

import type { BigVoice, Level } from "@/lib/big-voices";
import { shortDay } from "@/lib/format";
import { sourceName } from "@/lib/listening-read";
import {
  APPROACH_LABEL,
  APPROACH_STATUSES,
  invitation as draftInvitation,
  STANDING_LINES,
  whyThem,
  type ApproachStatus,
} from "@/lib/outreach";

export function BriefVoice({
  voice,
  level,
  days,
  campaign,
  approach,
  close,
  copy,
  setStatus,
  pulseConnected = false,
  send,
}: {
  voice: BigVoice;
  level: Level;
  days: number;
  /** Who the invitation is from. */
  campaign: { candidate: string | null; seat: string };
  /** Set when the voice was approached before: where it stands, since when, and what was said. */
  approach?: { status: string; at: string; invitation?: string } | undefined;
  close: () => void;
  /** Called once the invitation is on the clipboard: records the approach. */
  copy: (invitation: string) => void | Promise<void>;
  /** Moves an approach's status by hand; absent for someone who may only look. */
  setStatus?: (status: ApproachStatus) => void;
  /** Whether Daraja Pulse can take an invitation. */
  pulseConnected?: boolean;
  /** Sends the invitation through Pulse. */
  send?: (invitation: string) => void | Promise<void>;
}) {
  const [text, setText] = useState(() => approach?.invitation || draftInvitation(campaign, voice));
  const [busy, setBusy] = useState(false);
  const canSend = pulseConnected && Boolean(send);

  if (voice.kind === "outlet")
    return (
      <div className="card br" style={{ marginTop: 14 }}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={close}>
          ← Big voices
        </button>
        <h2 style={{ marginTop: 8 }}>{voice.name}</h2>
        <p className="f-note">
          An outlet gets a note to its newsroom, not a creator brief. Press it with the story, not
          with a paid post.
        </p>
      </div>
    );

  const why = whyThem(voice, level, days);
  const status = APPROACH_STATUSES.find((s) => s === approach?.status);

  const doCopy = async () => {
    setBusy(true);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast.error("Couldn't copy: select the text and copy it by hand. Nothing was recorded.");
      setBusy(false);
      return;
    }
    try {
      await copy(text);
      toast.success("Copied and recorded. Paste it into WhatsApp or a direct message.");
    } catch (e) {
      toast.error(
        e instanceof Error
          ? `${e.message} The text is on your clipboard.`
          : "It was copied, but not recorded.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card br" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={close}>
            ← Big voices
          </button>
          <h2 style={{ marginTop: 8 }}>Brief {voice.name}</h2>
          <p className="meta">
            {sourceName(voice.platform)}
            {voice.url && (
              <>
                {" · "}
                <a
                  href={voice.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${voice.name} on ${sourceName(voice.platform)}, opens in a new tab`}
                >
                  Open their page ↗
                </a>
              </>
            )}
            {approach && status ? ` · ${APPROACH_LABEL[status]} ${shortDay(approach.at)}` : ""}
          </p>
        </div>
      </div>

      <h3 className="br-h">Why them</h3>
      <ul className="br-why">
        {why.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>

      <h3 className="br-h">Daraja Pulse&apos;s standing lines</h3>
      <ol className="br-lines">
        {STANDING_LINES.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ol>
      <p className="f-note">These go on every brief and cannot be removed.</p>

      <label className="auth-field">
        <span>The invitation: read it, change it, then send it yourself</span>
        <textarea
          rows={8}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <p className="meta">{text.length.toLocaleString("en-KE")} of 2,000 characters.</p>

      <div className="rx-acts">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={busy || !text.trim()}
          onClick={() => void doCopy()}
        >
          Copy for WhatsApp or DM
        </button>
        <button
          type="button"
          className="btn btn--sm"
          disabled={!canSend || busy}
          title={canSend ? undefined : "Daraja Pulse isn't connected to Groundwork yet"}
          onClick={() => void send?.(text)}
        >
          Send to Daraja Pulse
        </button>
      </div>
      {!canSend && (
        <p className="f-note">
          Daraja Pulse isn&apos;t connected to Groundwork yet. Copy the invitation and send it
          yourself; the approach is recorded when you copy.
        </p>
      )}

      {approach && setStatus && (
        <label className="auth-field br-status">
          <span>Where it stands</span>
          <select
            value={status ?? "approached"}
            onChange={(e) => setStatus(e.target.value as ApproachStatus)}
          >
            {APPROACH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {APPROACH_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
