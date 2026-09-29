import { createFileRoute, redirect } from "@tanstack/react-router";

// Overview is now part of Home; old links and bookmarks land there.
export const Route = createFileRoute("/_authenticated/overview")({
  beforeLoad: () => {
    throw redirect({ to: "/home", replace: true });
  },
});
