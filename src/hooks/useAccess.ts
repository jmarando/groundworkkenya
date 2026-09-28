import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { campaignSlugFromHost, PRINCIPAL_ROLES, TEAM_ROLES, type MyRole } from "@/lib/access";

export type Campaign = {
  id: string;
  slug: string;
  name: string;
  candidate: string | null;
  seat: string;
  host: string | null;
};

export type Access = {
  userId: string;
  role: MyRole;
  campaign: Campaign | null;
  /** On a campaign's own address that is not theirs. */
  wrongCampaign: boolean;
  /** Candidate, campaign manager or super admin: the money-and-strategy circle. */
  isPrincipal: boolean;
  /** Can admit people and change roles in this campaign. */
  isAdmin: boolean;
  /** The platform owner, who can switch between campaigns. */
  isSuper: boolean;
  /** Signed in but not admitted to any campaign. */
  isPending: boolean;
};

/**
 * Read in the browser from the signed-in session. This only decides what the
 * console shows; what data anyone gets is decided in the database.
 */
export function useAccess() {
  const { data, isPending, isError, refetch, isFetching } = useQuery<Access>({
    queryKey: ["my-access"],
    queryFn: async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw authError ?? new Error("Not signed in.");

      // On sakaja.groundwork.ke and the like: ask to join (or, for the super
      // admin, open) that campaign. Harmless if already a member.
      const slug = campaignSlugFromHost(window.location.host);
      let wrongCampaign = false;
      if (slug) {
        const { data: result } = await supabase.rpc("request_campaign_access", { _slug: slug });
        wrongCampaign = result === "elsewhere";
      }

      const [{ data: role, error }, { data: campaignId }] = await Promise.all([
        supabase.rpc("my_campaign_role"),
        supabase.rpc("my_campaign"),
      ]);
      if (error) throw new Error("Could not check your access.");
      let campaign: Campaign | null = null;
      if (campaignId) {
        const { data: c } = await supabase
          .from("campaigns")
          .select("id, slug, name, candidate, seat, host")
          .eq("id", campaignId as string)
          .maybeSingle();
        campaign = c ?? null;
      }
      const r = (role as MyRole) ?? null;
      return {
        userId: auth.user.id,
        role: r,
        campaign,
        wrongCampaign,
        isPrincipal: PRINCIPAL_ROLES.includes(r),
        isAdmin: PRINCIPAL_ROLES.includes(r),
        isSuper: r === "super",
        isPending: !TEAM_ROLES.includes(r),
      };
    },
    staleTime: 5 * 60_000,
  });
  return {
    access: data,
    loading: isPending,
    failed: isError,
    checking: isFetching,
    recheck: refetch,
    campaign: data?.campaign ?? null,
    isPrincipal: data?.isPrincipal ?? false,
    isAdmin: data?.isAdmin ?? false,
    isSuper: data?.isSuper ?? false,
    isPendingApproval: data?.isPending ?? false,
    wrongCampaign: data?.wrongCampaign ?? false,
  };
}
