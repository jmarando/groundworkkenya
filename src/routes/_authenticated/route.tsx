import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { ConsoleShell } from "@/components/gw/ConsoleShell";
import { GwMark } from "@/components/gw/GwMark";
import { useAccess } from "@/hooks/useAccess";
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
  const { recheck, checking } = useAccess();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <Gate>
      <span className="eyebrow">Groundwork · the campaign OS</span>
      <h1>You're signed in. An admin needs to let you in.</h1>
      <p>
        Accounts start with no access to campaign data. Ask whoever runs the campaign to open{" "}
        <b>Team</b> in the console and give you a role.
      </p>
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
  const { loading, failed, recheck, checking, isPendingApproval } = useAccess();

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

  if (isPendingApproval) return <Waiting />;

  return (
    <ConsoleShell>
      <Outlet />
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
