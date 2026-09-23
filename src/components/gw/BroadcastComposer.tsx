import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  estimateBroadcast,
  MAX_PARTS,
  sendBroadcast,
  type BroadcastAudience,
} from "@/lib/broadcast.functions";
import { plainify, smsParts } from "@/lib/sms";

const nf = new Intl.NumberFormat("en-KE");
const kes = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 2 });

export function BroadcastComposer({
  audience,
  describe,
  initialBody,
  smsRate,
  onClose,
}: {
  audience: BroadcastAudience;
  /** Plain-language summary of the filters, e.g. "Youth in Kileleshwa". */
  describe: string;
  initialBody: string;
  smsRate: number;
  onClose: () => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [reviewing, setReviewing] = useState(false);
  // One key per composer: a double press, or a retry after a dropped
  // connection, reports the first send rather than texting everyone twice.
  const [clientKey] = useState(() => crypto.randomUUID());

  const fetchEstimate = useServerFn(estimateBroadcast);
  const send = useServerFn(sendBroadcast);
  const queryClient = useQueryClient();

  const { data: est } = useQuery({
    queryKey: ["broadcast-estimate", audience],
    queryFn: () => fetchEstimate({ data: audience }),
    placeholderData: keepPreviousData,
  });

  const count = useMemo(() => smsParts(body), [body]);
  const recipients = est?.reachable ?? 0;
  const cost = recipients * count.parts * smsRate;

  const problem = !body.trim()
    ? "Write the message first."
    : !/\bstop\b/i.test(body)
      ? 'Say how to opt out, for example "STOP kujiondoa".'
      : count.parts > MAX_PARTS
        ? `That is ${count.parts} SMS parts. Keep it to ${MAX_PARTS} or fewer.`
        : recipients === 0 && est
          ? "Nobody in this audience has agreed to SMS."
          : null;

  const mutation = useMutation({
    mutationFn: () => send({ data: { clientKey, body, audience } }),
    onSuccess: async (r) => {
      if (r.repeat) {
        toast.info("That broadcast was already sent. Nothing was sent twice.");
      } else if (r.live) {
        toast.success(`Sending to ${nf.format(r.queued)} people.`);
      } else {
        toast.success(`Staged for ${nf.format(r.queued)} people. Nothing sends in dry run.`, {
          description: "Each message is composed, addressed and costed, and held back.",
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["broadcast"] });
      onClose();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setReviewing(false);
    },
  });

  return (
    <div className="pb-scrim" role="dialog" aria-modal="true" aria-labelledby="bc-title">
      <div className="pb">
        <div className="pb-head">
          <div>
            <span className="eyebrow">Broadcast · SMS</span>
            <h2 id="bc-title">{reviewing ? "Check it, then send." : "Say it in one text."}</h2>
          </div>
          <button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="pb-body">
          <div className="bc-audience">
            <span className="eyebrow">To</span>
            <p>
              <b>{describe}</b>
            </p>
            <p className="f-note">
              {est ? (
                <>
                  {nf.format(est.matched)} people match ·{" "}
                  <b>{nf.format(est.reachable)} have agreed to SMS</b> and will get it. Anyone who
                  replies STOP before their message goes out is skipped.
                </>
              ) : (
                "Counting the audience…"
              )}
            </p>
          </div>

          {reviewing ? (
            <div className="bc-phone" aria-label="Message preview">
              <p>{body.trim()}</p>
            </div>
          ) : (
            <label className="pb-field">
              <span>Message</span>
              <textarea
                rows={5}
                value={body}
                maxLength={918}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
          )}

          <p className="f-note bc-count" aria-live="polite">
            {nf.format(count.length)} characters · {count.parts} SMS{" "}
            {count.parts === 1 ? "part" : "parts"} each ·{" "}
            {count.encoding === "GSM-7" ? "plain text" : "unicode"}
          </p>

          {count.encoding === "UCS-2" && (
            <div className="bc-warn" role="note">
              <p>
                {count.offenders.map((c) => `“${c}”`).join(" ")}{" "}
                {count.offenders.length === 1 ? "turns" : "turn"} the whole message into unicode: 70
                characters per SMS instead of 160, which can double the cost.
              </p>
              {!reviewing && plainify(body) !== body && (
                <button
                  className="btn btn--ghost btn--sm"
                  type="button"
                  onClick={() => setBody(plainify(body))}
                >
                  Use plain characters
                </button>
              )}
            </div>
          )}
        </div>

        <div className="pb-foot">
          <p className="f-note" aria-live="polite">
            {problem ?? (
              <>
                About <b>KES {kes.format(cost)}</b> for {nf.format(recipients)}{" "}
                {recipients === 1 ? "person" : "people"}
                {est && !est.live ? " · dry run: staged, not sent" : ""}
              </>
            )}
          </p>
          {reviewing ? (
            <div className="bc-actions">
              <button
                className="btn btn--ghost"
                type="button"
                disabled={mutation.isPending}
                onClick={() => setReviewing(false)}
              >
                Edit
              </button>
              <button
                className="btn btn--primary"
                type="button"
                disabled={Boolean(problem) || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending
                  ? "Sending…"
                  : est?.live
                    ? `Send to ${nf.format(recipients)}`
                    : `Stage for ${nf.format(recipients)}`}
              </button>
            </div>
          ) : (
            <button
              className="btn btn--primary"
              type="button"
              disabled={Boolean(problem)}
              onClick={() => setReviewing(true)}
            >
              Review
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
