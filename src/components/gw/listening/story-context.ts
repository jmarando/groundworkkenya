// How a post list reaches a story: a story's name, and a way to open it. Provided by the Listening
// page so a post anywhere in it (Overview, a voice's posts, All posts) can link to its story without
// passing the same two props down every level.
import { createContext, useContext } from "react";

export type StoryLinks = {
  open: (id: string) => void;
  title: (id: string) => string | undefined;
};

const StoryContext = createContext<StoryLinks | null>(null);

export const StoryProvider = StoryContext.Provider;
export const useStoryLinks = (): StoryLinks | null => useContext(StoryContext);
