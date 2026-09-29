import { createFileRoute, redirect } from "@tanstack/react-router";

// The morning briefing is now part of Home; old links and bookmarks land there.
export const Route = createFileRoute("/_authenticated/briefing")({
  beforeLoad: () => {
    throw redirect({ to: "/home", replace: true });
  },
});
