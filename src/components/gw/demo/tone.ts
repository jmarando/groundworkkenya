import type { Tone } from "@/lib/demo/types";

/** Series colour roles; CSS gives each a validated colour per surface. */
export type SeriesTone = Tone | "und";

export const toneVar = (tone: SeriesTone) => `var(--series-${tone})`;
