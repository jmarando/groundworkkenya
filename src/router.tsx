import { onlineManager, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { startInstallable } from "@/lib/offline/app";

export const getRouter = () => {
  if (typeof window !== "undefined") {
    // React Query only hears the browser's online and offline events, so it's told where it starts.
    onlineManager.setOnline(navigator.onLine);
    startInstallable();
  }
  // A save with no signal fails at once with the page's usual message, rather than waiting for signal.
  const queryClient = new QueryClient({ defaultOptions: { mutations: { networkMode: "always" } } });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
