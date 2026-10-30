// The data side of the story screen: reads one story, and marks it handled. The screen is
// StoryView.tsx.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { StoryView } from "@/components/gw/listening/StoryView";
import { QueryState } from "@/components/gw/QueryState";
import { getStory, markStoryHandled } from "@/lib/stories.functions";

export function StoryPanel({
  id,
  back,
  react,
  brief,
}: {
  id: string;
  back: () => void;
  react?: ((mentionId: string, storyId?: string) => void) | undefined;
  brief?: () => void;
}) {
  const fetchStory = useServerFn(getStory);
  const mark = useServerFn(markStoryHandled);
  const queryClient = useQueryClient();
  const { data, dataUpdatedAt, isLoading, isError, refetch } = useQuery({
    queryKey: ["story", id],
    queryFn: () => fetchStory({ data: { id } }),
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const handle = async () => {
    setBusy(true);
    setNote(null);
    try {
      await mark({ data: { id } });
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ["listening"] });
    } catch (e) {
      setNote(e instanceof Error ? e.message : "That story could not be marked.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <QueryState
        isLoading={isLoading}
        isError={isError}
        retry={() => void refetch()}
        what="the story"
      />
      {note && (
        <p className="f-note" role="alert">
          {note}
        </p>
      )}
      {data && (
        <StoryView
          data={data}
          now={dataUpdatedAt}
          back={back}
          {...(react ? { react } : {})}
          {...(brief ? { brief } : {})}
          handle={() => void handle()}
          busy={busy}
        />
      )}
    </>
  );
}
