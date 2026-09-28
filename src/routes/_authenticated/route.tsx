import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { ConsoleShell } from "@/components/gw/ConsoleShell";
import { GwMark } from "@/components/gw/GwMark";
import { useAccess } from "@/hooks/useAccess";
import { canOpen, homeFor } from "@/lib/access";
import { Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

function Gate({ children }: { children: ReactNode }) {
  return (
    <div className="gate">
      <div className="gate-card">
        <GwMark />
        {children}
      </div>
    </div>
  );
}

/**
 * Signing in is not the same as being admitted. Anyone can create an account;
 * until an admin gives them a role they hold no access, and see this instead
 * of an empty console that looks broken.
 */
function Waiting() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { recheck, checking, campaign, wrongCampaign } = useAccess();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <Gate>
      <span className="eyebrow">{campaign ? campaign.name : "Groundwork · the campaign OS"}</span>
      {wrongCampaign ? (
        <>
          <h1>You're not part of this campaign.</h1>
          <p>
            Your account belongs to another campaign. Sign in at your own campaign's address, or
            sign out and use a different email.
          </p>
        </>
      ) : campaign ? (
        <>
          <h1>You're signed in. The campaign needs to let you in.</h1>
          <p>
            Ask the candidate or campaign manager of <b>{campaign.name}</b> to open <b>Team</b> and
            give you a role.
          </p>
        </>
      ) : (
        <>
          <h1>You're signed in, but not on a campaign yet.</h1>
          <p>
            Open your campaign's own address (for example sakaja.groundwork.ke), or ask your
            campaign to invite this email.
          </p>
        </>
      )}
      <div className="gate-actions">
        <button
          className="btn btn--primary"
          type="button"
          disabled={checking}
          onClick={() => void recheck()}
        >
          {checking ? "Checking…" : "I've been added — check again"}
        </button>
        <button className="btn btn--ghost" type="button" onClick={signOut}>
          Sign out
        </button>
      </div>
    </Gate>
  );
}

function Authenticated() {
  const { loading, failed, recheck, checking, isPendingApproval, wrongCampaign, access } =
    useAccess();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (loading) {
    return (
      <Gate>
        <span className="eyebrow">Checking your access…</span>
      </Gate>
    );
  }

  if (failed) {
    return (
      <Gate>
        <span className="eyebrow">Groundwork</span>
        <h1>We couldn't check your access.</h1>
        <p>This is usually the connection. Try again in a moment.</p>
        <div className="gate-actions">
          <button
            className="btn btn--primary"
            type="button"
            disabled={checking}
            onClick={() => void recheck()}
          >
            {checking ? "Trying…" : "Try again"}
          </button>
        </div>
      </Gate>
    );
  }

  if (isPendingApproval || wrongCampaign) return <Waiting />;

  const role = access?.role ?? null;
  return (
    <ConsoleShell>
      {canOpen(role, pathname) ? (
        <Outlet />
      ) : (
        <section className="view active" aria-label="Not available">
          <div className="card">
            <h2>This page isn't part of your role.</h2>
            <p className="f-note">
              Ask your candidate or campaign manager if you need it.{" "}
              <Link to={homeFor(role)}>Go to your start page</Link>
            </p>
          </div>
        </section>
      )}
    </ConsoleShell>
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Authenticated,
});
