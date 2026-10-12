import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { focusCampaign, listCampaigns } from "@/lib/campaigns.functions";

/** Super admin only: pick which campaign the console shows. */
export function CampaignSwitcher({ current }: { current: string | null }) {
  const fetchCampaigns = useServerFn(listCampaigns);
  const focus = useServerFn(focusCampaign);
  const queryClient = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: ["campaigns"], queryFn: () => fetchCampaigns() });

  async function change(id: string) {
    setBusy(true);
    try {
      await focus({ data: { campaignId: id } });
      // Everything on screen belonged to the old campaign. Reset (not remove)
      // so queries still on screen refetch at once, then re-run route loaders.
      await queryClient.cancelQueries();
      await queryClient.resetQueries({ predicate: (q) => q.queryKey[0] !== "campaigns" });
      await router.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not switch campaign.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      className="team-select campaign-switch"
      aria-label="Open campaign"
      value={current ?? ""}
      disabled={busy || !data}
      onChange={(e) => void change(e.target.value)}
    >
      <option value="" disabled>
        Open a campaign…
      </option>
      {(data ?? []).map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
