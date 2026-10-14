import { createContext, useContext } from "react";

export type OfflineData = {
  /** Saved data is back in the query cache, or there was none to put back. */
  ready: boolean;
  /** Stops saving and deletes everything saved on this phone, for a sign-out. */
  forget: () => Promise<void>;
};

/** Provided by OfflineDataProvider (src/components/gw/offline/OfflineData.tsx). */
export const OfflineDataContext = createContext<OfflineData>({
  ready: true,
  forget: async () => undefined,
});

export const useOfflineData = (): OfflineData => useContext(OfflineDataContext);
