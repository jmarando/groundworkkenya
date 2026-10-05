import { createFileRoute, redirect } from "@tanstack/react-router";

import { peopleForward } from "@/lib/voters-view";

// People is now the People view on Voters; old links and bookmarks land there.
export const Route = createFileRoute("/_authenticated/people")({
  beforeLoad: ({ location }) => {
    throw redirect({
      to: "/voters",
      search: peopleForward(location.search as Record<string, unknown>),
      replace: true,
    });
  },
});
