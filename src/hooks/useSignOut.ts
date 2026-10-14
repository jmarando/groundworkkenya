import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useOfflineData } from "@/hooks/useOfflineData";
import { supabase } from "@/integrations/supabase/client";
import { forgetPhoneSession, signOutHere } from "@/lib/offline/session";

/**
 * Signs out on this phone, signal or not, deleting the page data saved on it.
 * Supabase's sign-out needs signal; when it fails, the sign-in kept on the
 * phone is deleted here instead, so the phone is signed out either way.
 */
export function useSignOut(): () => Promise<void> {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { forget } = useOfflineData();
  return async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await forget();
    await signOutHere(() => supabase.auth.signOut(), forgetPhoneSession);
    navigate({ to: "/auth", replace: true });
  };
}
