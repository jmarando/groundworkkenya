import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { WebsiteEditor } from "@/components/gw/website/WebsiteEditor";
import { useAccess } from "@/hooks/useAccess";
import { getSite } from "@/lib/site.functions";

export const Route = createFileRoute("/_authenticated/website")({
  component: Website,
  head: () => ({
    meta: [
      { title: "Website · Groundwork" },
      {
        name: "description",
        content:
          "Write the campaign's website in English and Swahili, preview it on a phone and publish it.",
      },
      { property: "og:title", content: "Website · Groundwork" },
      {
        property: "og:description",
        content:
          "Write the campaign's website in English and Swahili, preview it on a phone and publish it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Website() {
  const { campaign } = useAccess();
  const fetchSite = useServerFn(getSite);
  // A new key remounts the editor with what the server has.
  const [loadKey, setLoadKey] = useState(0);
  const { data, error, refetch } = useQuery({
    queryKey: ["site", campaign?.id ?? null],
    queryFn: () => fetchSite(),
    enabled: Boolean(campaign?.id),
    // The editor holds the draft; don't refetch it from under someone typing.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (error || !data) {
    return (
      <section className="view active" aria-label="Website">
        <div className="vh">
          <div>
            <span className="eyebrow">Comms · website</span>
            <h1>
              Your site, <span className="serif">your words.</span>
            </h1>
            <p className="meta">
              {error
                ? error instanceof Error
                  ? error.message
                  : "Could not load the website."
                : "Loading the website…"}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <WebsiteEditor
      key={loadKey}
      data={data}
      onReload={() => {
        void refetch().then(() => setLoadKey((k) => k + 1));
      }}
      onChanged={() => void refetch()}
    />
  );
}
