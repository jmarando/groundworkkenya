import { createFileRoute, redirect } from "@tanstack/react-router";

// Canvassing is now the Doors view on Voters; old links and bookmarks land there.
export const Route = createFileRoute("/_authenticated/canvassing")({
  beforeLoad: () => {
    throw redirect({ to: "/voters", search: { view: "doors" }, replace: true });
  },
});
