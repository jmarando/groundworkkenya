import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { ConsoleShell } from "@/components/gw/ConsoleShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: () => (
    <ConsoleShell>
      <Outlet />
    </ConsoleShell>
  ),
});
