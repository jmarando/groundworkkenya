import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { useAccess } from "@/hooks/useAccess";
import { createCampaign, focusCampaign, listCampaigns } from "@/lib/campaigns.functions";

export const Route = createFileRoute("/_authenticated/campaigns")({
  component: Campaigns,
  head: () => ({
    meta: [
      { title: "Campaigns · Groundwork" },
      { name: "description", content: "Every campaign on Groundwork, each with its own team and data." },
    ],
  }),
});

const EMPTY = { name: "", candidate: "", seat: "", level: "mp", slug: "", candidateEmail: "" };

function Campaigns() {
  const { isSuper, campaign } = useAccess();
  const fetchCampaigns = useServerFn(listCampaigns);
  const add = useServerFn(createCampaign);
  const focus = useServerFn(focusCampaign);
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const { data } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => fetchCampaigns(),
    enabled: isSuper,
  });

  const create = useMutation({
    mutationFn: () => add({ data: form }),
    onSuccess: async () => {
      toast.success(
        form.candidateEmail
          ? "Campaign added and the candidate invited."
          : "Campaign added.",
      );
      setForm(EMPTY);
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = useMutation({
    mutationFn: (id: string) => focus({ data: { campaignId: id } }),
    onSuccess: async () => {
      await queryClient.cancelQueries();
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "campaigns" });
      await queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const field = (k: keyof typeof EMPTY) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  if (!isSuper) {
    return (
      <section className="view active" aria-label="Campaigns">
        <div className="card">
          <p className="f-note">Only the Groundwork super admin manages campaigns.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="view active" aria-label="Campaigns">
      <div className="vh">
        <div>
          <span className="eyebrow">System · campaigns</span>
          <h1>
            Every <span className="serif">campaign.</span>
          </h1>
          <p className="meta">
            Each campaign has its own address, team and data. Nobody on one campaign can see
            another's.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>On the platform</h2>
          <span className="eyebrow">{data?.length ?? 0}</span>
        </div>
        <ul className="team-list">
          {(data ?? []).map((c) => (
            <li key={c.id} className="team-row">
              <div className="team-who">
                <b>
                  {c.name}
                  {c.id === campaign?.id && <span className="chip--self">open</span>}
                </b>
                <span className="mono">{c.host ?? `${c.slug}.groundwork.ke`}</span>
                <small>
                  {c.seat} · {c.candidate ?? "No candidate named"} · {c.members} on the team
                </small>
              </div>
              <button
                className="btn btn--ghost"
                type="button"
                disabled={c.id === campaign?.id || open.isPending}
                onClick={() => open.mutate(c.id)}
              >
                {c.id === campaign?.id ? "Open now" : "Open"}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Add a campaign</h2>
        </div>
        <form
          className="campaign-form"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <label>
            <span className="eyebrow">Campaign name</span>
            <input className="team-select" required placeholder="Sakaja 2027" {...field("name")} />
          </label>
          <label>
            <span className="eyebrow">Candidate</span>
            <input className="team-select" {...field("candidate")} />
          </label>
          <label>
            <span className="eyebrow">Seat</span>
            <input className="team-select" required placeholder="Governor · Nairobi" {...field("seat")} />
          </label>
          <label>
            <span className="eyebrow">Level</span>
            <select className="team-select" {...field("level")}>
              <option value="president">President</option>
              <option value="governor">Governor</option>
              <option value="senator">Senator</option>
              <option value="woman-rep">Woman Rep</option>
              <option value="mp">MP</option>
              <option value="mca">MCA</option>
            </select>
          </label>
          <label>
            <span className="eyebrow">Address</span>
            <input className="team-select" required placeholder="sakaja" {...field("slug")} />
            <small className="f-note">{form.slug || "name"}.groundwork.ke</small>
          </label>
          <label>
            <span className="eyebrow">Candidate's email (invite)</span>
            <input className="team-select" type="email" {...field("candidateEmail")} />
          </label>
          <button className="btn btn--primary" type="submit" disabled={create.isPending}>
            {create.isPending ? "Adding…" : "Add campaign"}
          </button>
        </form>
      </div>
    </section>
  );
}
