import { createFileRoute, redirect } from "@tanstack/react-router";

// Social is now part of Inbox (the messages and the channel card) and Listening (what is said in
// public); old links and bookmarks land in Inbox.
export const Route = createFileRoute("/_authenticated/social")({
  beforeLoad: () => {
    throw redirect({ to: "/inbox", replace: true });
  },
});
