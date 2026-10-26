import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { ConsoleShell } from "@/components/gw/ConsoleShell";
import { GwMark } from "@/components/gw/GwMark";
import { NeedsSignal } from "@/components/gw/offline/NeedsSignal";
import { useAccess } from "@/hooks/useAccess";
import { useOfflineData } from "@/hooks/useOfflineData";
import { useOnline } from "@/hooks/useOnline";
import { useSignOut } from "@/hooks/useSignOut";
import { homeFor, pageVerdict } from "@/lib/access";
import { gateState, needsSignal } from "@/lib/offline/screens";
import { entryUser, phoneUser } from "@/lib/offline/session";
import { Link, Navigate, useRouterState } from "@tanstack/react-router";
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
  const { recheck, checking, campaign, wrongCampaign } = useAccess();
  const signOut = useSignOut();

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
  const { ready } = useOfflineData();
  const online = useOnline();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const gate = gateState({ ready, loading, failed, hasAccess: Boolean(access), online });

  if (gate === "checking") {
    return (
      <Gate>
        <span className="eyebrow">Checking your access…</span>
      </Gate>
    );
  }

  if (gate === "first-visit") {
    return (
      <Gate>
        <span className="eyebrow">Groundwork</span>
        <h1>You're offline.</h1>
        <p>Open Groundwork once with signal to use it offline.</p>
      </Gate>
    );
  }

  if (gate === "failed") {
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
  // Whether any query whose key starts with `key` has data: what an offline page needs saved.
  const hasData = (key: string) =>
    queryClient
      .getQueryCache()
      .findAll({ queryKey: [key] })
      .some((q) => q.state.data !== undefined);
  const verdict = pageVerdict(role, pathname);
  return (
    <ConsoleShell>
      {verdict === "send-home" ? (
        <Navigate to={homeFor(role)} replace />
      ) : verdict === "open" ? (
        !online && needsSignal(pathname, hasData) ? (
          <NeedsSignal />
        ) : (
          <Outlet />
        )
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
  // The signed-in console is not for search: its screens hold nothing a crawler could read.
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  // With no signal, or a connection too weak to answer in time, the sign-in kept on the phone.
  beforeLoad: async () => {
    const user = await entryUser(() => supabase.auth.getUser(), phoneUser, navigator.onLine);
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: Authenticated,
});
