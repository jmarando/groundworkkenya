// The walk lists out with this person, and a list's doors with the people on file at them: read
// when the field page opens and every minute while there is signal, and kept on the phone
// (src/lib/offline/saved.ts) for no signal. A read that fails keeps what the phone already has:
// the queries throw rather than answer nothing.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getMyWalkLists, getWalkListDoors } from "@/lib/walk-lists.functions";

const EVERY_MINUTE = 60_000;

/** The lists out with the person, newest first. */
export function useMyWalkLists(online: boolean) {
  const fetchMine = useServerFn(getMyWalkLists);
  return useQuery({
    queryKey: ["my-walk-lists"],
    queryFn: async () => {
      const lists = await fetchMine();
      if (lists === null) throw new Error("Could not read your walk lists.");
      return lists;
    },
    refetchOnMount: "always",
    refetchInterval: online ? EVERY_MINUTE : false,
    staleTime: 30_000,
    retry: 1,
  });
}

/** One list's doors in walking order, each with its latest visit, and who is on file at them. */
export function useListDoors(listId: string, online: boolean) {
  const fetchDoors = useServerFn(getWalkListDoors);
  return useQuery({
    queryKey: ["walk-list-doors", listId],
    queryFn: async () => {
      const read = await fetchDoors({ data: { id: listId } });
      if (read === null) throw new Error("Could not read this walk list.");
      return read;
    },
    refetchOnMount: "always",
    refetchInterval: online ? EVERY_MINUTE : false,
    staleTime: 30_000,
    retry: 1,
  });
}
