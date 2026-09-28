import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { assignAgent } from "@/lib/election.functions";
import { normalizeKePhone } from "@/lib/phone";

/**
 * Put a polling agent on a station. Their phone is how they are recognised
 * when they file Form 34A on USSD and send its photo on WhatsApp.
 */
export function AssignAgent({
  station,
  onClose,
}: {
  station: { id: string; code: string; name: string; agent: string | null; phone: string | null };
  onClose: () => void;
}) {
  const [name, setName] = useState(station.agent ?? "");
  const [phone, setPhone] = useState(station.phone ?? "");
  const assign = useServerFn(assignAgent);
  const queryClient = useQueryClient();

  const normalised = normalizeKePhone(phone);
  const problem = !name.trim()
    ? "Add the agent's name."
    : !normalised
      ? "Use a Kenyan mobile number like 0712 345 678."
      : null;

  const mutation = useMutation({
    mutationFn: (clear: boolean) =>
      assign({
        data: { stationId: station.id, name: clear ? "" : name, phone: clear ? "" : phone },
      }),
    onSuccess: async (_r, clear) => {
      toast.success(
        clear
          ? `${station.code} has no agent now.`
          : `${name.trim()} is the agent at ${station.code}.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agents"] }),
        queryClient.invalidateQueries({ queryKey: ["warroom"] }),
      ]);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="pb-scrim" role="dialog" aria-modal="true" aria-labelledby="aa-title">
      <form
        className="pb"
        onSubmit={(e) => {
          e.preventDefault();
          if (!problem) mutation.mutate(false);
        }}
      >
        <div className="pb-head">
          <div>
            <span className="eyebrow">
              Agents · {station.code} {station.name}
            </span>
            <h2 id="aa-title">Who files this station&apos;s forms.</h2>
          </div>
          <button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="pb-body">
          <div className="pb-row pb-row--2">
            <label className="pb-field">
              <span>Agent&apos;s name</span>
              <input
                value={name}
                maxLength={80}
                autoComplete="off"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="pb-field">
              <span>Their mobile number</span>
              <input
                value={phone}
                inputMode="tel"
                placeholder="0712 345 678"
                autoComplete="off"
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
          </div>
          <p className="meta">
            On election night they dial the campaign&apos;s USSD code from this number, choose{" "}
            <b>5. Fomu 34A</b>, and key in each stream&apos;s counts. Then they send the signed
            form&apos;s photo on WhatsApp from the same number.
          </p>
        </div>

        <div className="pb-foot">
          <p className="f-note" aria-live="polite">
            {problem ?? `Saving as ${normalised}.`}
          </p>
          {station.phone && (
            <button
              className="btn btn--ghost"
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(true)}
            >
              Take agent off
            </button>
          )}
          <button
            className="btn btn--primary"
            type="submit"
            disabled={Boolean(problem) || mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save agent"}
          </button>
        </div>
      </form>
    </div>
  );
}
