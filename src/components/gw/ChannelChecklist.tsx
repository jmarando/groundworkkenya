import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { listChannels, saveChannel, type Channel, type ChannelKind } from "@/lib/campaigns.functions";

const GUIDE: Record<ChannelKind, { name: string; field: string; placeholder: string; steps: (slug: string) => string[] }> = {
  whatsapp: {
    name: "WhatsApp",
    field: "Phone number",
    placeholder: "+254 7XX XXX XXX",
    steps: () => [
      "Add the campaign's number to the same Meta business account as the current WhatsApp connection (WhatsApp Manager → Phone numbers → Add).",
      "Or connect it as its own WhatsApp connection in Connectors.",
      "Save the number here so its messages land in this campaign's Inbox.",
    ],
  },
  sms: {
    name: "SMS",
    field: "Sender name or short code",
    placeholder: "SAKAJA2027",
    steps: () => [
      "In Africa's Talking → SMS → Sender IDs, request the campaign's own sender name (max 11 characters).",
      "Upload the signed Safaricom and Airtel letters. Approval takes 1–3 weeks.",
      "Save the approved name here.",
    ],
  },
  email: {
    name: "Email",
    field: "Email name",
    placeholder: "sakaja",
    steps: (slug) => [
      `Emails go out as "<campaign name>" from groundwork.ke.`,
      `Replies come back to ${slug}@in.groundwork.ke and land in this campaign's Inbox.`,
      "Nothing to set up per campaign — just keep the name unique.",
    ],
  },
  facebook: {
    name: "Facebook Page",
    field: "Page ID",
    placeholder: "1234567890",
    steps: () => [
      "In the Groundwork Meta app → Webhooks → Page, click Subscribe next to the campaign's Page.",
      "Find the Page ID under the Page's About → Page transparency.",
      "Save it here so comments and DMs route to this campaign.",
    ],
  },
  instagram: {
    name: "Instagram",
    field: "Instagram account ID",
    placeholder: "17841400000000000",
    steps: () => [
      "Link the Instagram professional account to the campaign's Facebook Page.",
      "In the Meta app → Webhooks → Instagram, subscribe to messages, comments and mentions.",
      "Save the account ID here.",
    ],
  },
  x: {
    name: "X",
    field: "Handle",
    placeholder: "@campaign",
    steps: () => [
      "Needs a paid X developer tier to receive mentions and DMs.",
      "Save the handle now; it switches live once the X keys are added.",
    ],
  },
};

const STATUS: Record<Channel["status"], string> = {
  not_started: "Not started",
  pending: "Waiting on provider",
  live: "Live",
};

export function ChannelChecklist({ campaignId, slug }: { campaignId: string; slug: string }) {
  const fetchChannels = useServerFn(listChannels);
  const save = useServerFn(saveChannel);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ChannelKind | null>(null);
  const [form, setForm] = useState({ identifier: "", display: "", status: "pending" as Channel["status"] });

  const { data } = useQuery({
    queryKey: ["channels", campaignId],
    queryFn: () => fetchChannels({ data: { campaignId } }),
  });

  const m = useMutation({
    mutationFn: (kind: ChannelKind) => save({ data: { campaignId, kind, ...form } }),
    onSuccess: async () => {
      toast.success("Channel saved.");
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["channels", campaignId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data) return <p className="f-note">Loading channels…</p>;
  const live = data.filter((c) => c.status === "live").length;

  return (
    <div className="chk">
      <p className="f-note">
        {live} of {data.length} channels live
      </p>
      <ul className="team-list">
        {data.map((c) => {
          const g = GUIDE[c.kind];
          return (
            <li key={c.kind} className="team-row chk-row">
              <div className="team-who">
                <b>
                  {g.name} <span className={`chk-status chk-status--${c.status}`}>{STATUS[c.status]}</span>
                </b>
                <span className="mono">{c.display || c.identifier || "—"}</span>
                {editing === c.kind && (
                  <div className="chk-edit">
                    <ol className="chk-steps">
                      {g.steps(c.identifier || slug).map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                    <label>
                      <span className="eyebrow">{g.field}</span>
                      <input
                        className="team-select"
                        placeholder={g.placeholder}
                        value={form.identifier}
                        onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))}
                      />
                    </label>
                    <label>
                      <span className="eyebrow">Label shown to the team</span>
                      <input
                        className="team-select"
                        value={form.display}
                        onChange={(e) => setForm((f) => ({ ...f, display: e.target.value }))}
                      />
                    </label>
                    <label>
                      <span className="eyebrow">Status</span>
                      <select
                        className="team-select"
                        value={form.status}
                        onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Channel["status"] }))}
                      >
                        {Object.entries(STATUS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="bc-actions">
                      <button className="btn btn--primary btn--sm" type="button" disabled={m.isPending} onClick={() => m.mutate(c.kind)}>
                        {m.isPending ? "Saving…" : "Save"}
                      </button>
                      <button className="btn btn--ghost btn--sm" type="button" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {editing !== c.kind && (
                <button
                  className="btn btn--ghost btn--sm"
                  type="button"
                  onClick={() => {
                    setEditing(c.kind);
                    setForm({
                      identifier: c.identifier ?? (c.kind === "email" ? slug : ""),
                      display: c.display ?? "",
                      status: c.status === "not_started" ? "pending" : c.status,
                    });
                  }}
                >
                  {c.status === "not_started" ? "Set up" : "Edit"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
